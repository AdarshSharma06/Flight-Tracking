"""Chat service — orchestrates LLM calls with RAG, tools, and conversation memory."""

import logging
from typing import Optional

from app.api.models import ChatRequest, ChatResponse
from app.api.system_prompt import SYSTEM_PROMPT
from app.llm.base import LLMClient, LLMMessage, LLMResponse
from app.memory.service import memory_service
from app.tools.registry import registry
from app.guardrails import guardrail_service

logger = logging.getLogger(__name__)

MAX_TOOL_ITERATIONS = 5

# ── Preference intent helpers (AI-6) ─────────────────────────────────
# Simple deterministic extraction for the in-scope preference keys.
# This keeps the critical save path fast, testable, and free of LLM chain-of-thought leakage.

_SAVE_KEYWORDS = ("remember", "save", "store", "keep", "note that i prefer")
_QUERY_KEYWORDS = (
    "what are my flight preferences",
    "what are my preferences",
    "show my preferences",
    "list my preferences",
    "my flight preferences",
    "my preferences",
    "what airline do i prefer",
    "what airline do i",
    "which airline do i prefer",
)

# Mapping of human phrases → stored preference keys/values
# Keeps VALID_PREFERENCE_KEYS as single source of truth via memory_service
_PREF_PATTERNS = {
    "prefers_direct": [
        (r"\bdirect flights?\b", "true"),
        (r"\bnon[-\s]?stop\b", "true"),
    ],
    "preferred_departure_time": [
        (r"\bevening\b", "evening"),
        (r"\bmorning\b", "morning"),
        (r"\bafternoon\b", "afternoon"),
        (r"\b18:00\b|\b6\s*pm\b", "evening"),
    ],
    "preferred_airline": [
        (r"\bair\s*india\b", "AI"),
        (r"\bindigo\b", "6E"),
        (r"\bspicejet\b", "SG"),
        (r"\bvistara\b", "UK"),
        (r"\bbritish\s*airways\b", "BA"),
        (r"\blufthansa\b", "LH"),
        (r"\bemirates\b", "EK"),
    ],
}

# Human-readable labels for confirmation messages
_PREF_VALUE_LABELS = {
    "prefers_direct": {"true": "direct flights", "false": "connecting flights"},
    "preferred_departure_time": {"evening": "evening departures", "morning": "morning departures", "afternoon": "afternoon departures"},
    "preferred_airline": {"AI": "Air India", "6E": "IndiGo", "SG": "SpiceJet", "UK": "Vistara", "BA": "British Airways", "LH": "Lufthansa", "EK": "Emirates"},
    "preferred_origin": {},
    "preferred_destination": {},
    "budget_preference": {},
}

_INTERNAL_REASONING_LEAK_PATTERNS = (
    "we need to respond",
    "let's parse",
    "let's compute",
    "thus include",
    "we'll include",
    "we need to",
    "need to respond with",
)


def _is_preference_query_intent(message: str) -> bool:
    lower = message.lower().strip()
    # Explicit query phrases
    for kw in _QUERY_KEYWORDS:
        if kw in lower:
            return True
    # Generic "my preferences" query
    if "my preferences" in lower and "?" in lower:
        return True
    return False


def _is_preference_save_intent(message: str) -> bool:
    lower = message.lower()
    # Must contain a preference signal
    has_pref_signal = any(
        phrase in lower
        for phrase in (
            "prefer",
            "preference",
            "direct flight",
            "non-stop",
            "nonstop",
            "evening",
            "morning",
            "afternoon",
            "air india",
            "indigo",
            "spicejet",
            "vistara",
            "british airways",
            "lufthansa",
            "emirates",
            "budget",
        )
    )
    if not has_pref_signal:
        return False
    # If it's clearly a query, not a save
    if _is_preference_query_intent(message):
        return False
    # Save intent when user says remember/save OR states a preference declaratively
    if any(kw in lower for kw in _SAVE_KEYWORDS):
        return True
    # Declarative "I prefer ..." without question mark is considered a save intent
    # But avoid treating transient "for this trip" as persistent save
    if "i prefer" in lower or "i like" in lower:
        # If the only preference mention is qualified as transient, treat as explicit override, not save
        # e.g., "for this trip I am okay with one stop" should not persist
        if "for this trip" in lower and lower.count("prefer") == 1 and "one stop" in lower:
            # This is the CASE E transient override – not a persistent save
            return False
        return True
    return False


def _extract_preferences_from_message(message: str) -> dict:
    """Deterministic extraction for the in-scope VALID_PREFERENCE_KEYS.

    Returns dict of key -> value ready for memory_service.set_preference.
    Uses regex matching; does not call LLM to avoid chain-of-thought leakage.
    """
    import re

    lower = message.lower()
    result: dict = {}

    # Transient qualifier check – if message contains "for this trip", the one-stop part is an explicit
    # override for the current request only and must NOT be persisted.
    is_transient = "for this trip" in lower

    # prefers_direct – handle both direct and one-stop, but transient one-stop does not overwrite
    has_direct = bool(re.search(r"\bdirect flights?\b", lower) or re.search(r"\bnon[-\s]?stop\b", lower))
    has_onestop = bool(re.search(r"\bone\s*stop\b", lower) or re.search(r"\bconnecting\b", lower))
    if has_direct:
        result["prefers_direct"] = "true"
    if has_onestop and not is_transient:
        result["prefers_direct"] = "false"

    # Evening/morning/afternoon → preferred_departure_time
    if re.search(r"\bevening\b", lower):
        result["preferred_departure_time"] = "evening"
    elif re.search(r"\bmorning\b", lower):
        result["preferred_departure_time"] = "morning"
    elif re.search(r"\bafternoon\b", lower):
        result["preferred_departure_time"] = "afternoon"

    # Airline
    airline_map = {
        r"\bair\s*india\b": "AI",
        r"\bindigo\b": "6E",
        r"\bspicejet\b": "SG",
        r"\bvistara\b": "UK",
        r"\bbritish\s*airways\b": "BA",
        r"\blufthansa\b": "LH",
        r"\bemirates\b": "EK",
    }
    for pat, code in airline_map.items():
        if re.search(pat, lower):
            result["preferred_airline"] = code
            break

    # Budget (simple)
    m = re.search(r"budget[^0-9]*(\d[\d,]*)", lower)
    if m:
        try:
            val = m.group(1).replace(",", "")
            result["budget_preference"] = val
        except Exception:
            pass

    # Origin/destination - very basic: "from delhi to mumbai" etc.
    # Not required for current tests, but keep for completeness
    m = re.search(r"from\s+([a-z]{3,})\s+to\s+([a-z]{3,})", lower)
    # We won't auto-store origin/destination without IATA validation; skip for now

    return result


def _format_preferences_for_display(prefs: dict) -> str:
    """Format stored preferences dict into human-readable bullet list."""
    if not prefs:
        return "You don't have any saved flight preferences yet."
    lines = ["Your saved flight preferences are:"]
    label_map = {
        "preferred_origin": lambda v: f"- Preferred origin: {v}",
        "preferred_destination": lambda v: f"- Preferred destination: {v}",
        "prefers_direct": lambda v: f"- {'Direct flights' if str(v).lower() in ('true','1','yes') else 'Connecting flights'}",
        "preferred_airline": lambda v: f"- Preferred airline: {_PREF_VALUE_LABELS.get('preferred_airline', {}).get(v, v)} ({v})" if v in _PREF_VALUE_LABELS.get("preferred_airline", {}) else f"- Preferred airline: {v}",
        "budget_preference": lambda v: f"- Budget: {v}",
        "preferred_departure_time": lambda v: f"- {_PREF_VALUE_LABELS.get('preferred_departure_time', {}).get(v.lower(), v) if isinstance(v, str) else v}",
        "preferred_arrival_time": lambda v: f"- Preferred arrival time: {v}",
    }
    for key, val in prefs.items():
        fmt = label_map.get(key)
        if fmt:
            try:
                lines.append(fmt(val))
            except Exception:
                lines.append(f"- {key}: {val}")
        else:
            lines.append(f"- {key}: {val}")
    # Fallback for keys like prefers_direct when label not in map
    return "\n".join(lines)


def _build_concise_save_confirmation(saved: dict) -> str:
    """Build short user-facing confirmation for saved preferences."""
    if not saved:
        return "Got it — I'll remember that for you."
    # Build human-readable list of saved preferences
    parts = []
    for k, v in saved.items():
        labels = _PREF_VALUE_LABELS.get(k, {})
        label = labels.get(v, labels.get(str(v).lower(), None))
        if label:
            parts.append(label)
        elif k == "preferred_departure_time":
            parts.append(f"{v} departures" if isinstance(v, str) else str(v))
        elif k == "prefers_direct":
            parts.append("direct flights" if str(v).lower() in ("true","1") else "connecting flights")
        elif k == "preferred_airline":
            # Map code back to name
            airline_names = {"AI": "Air India", "6E": "IndiGo", "SG": "SpiceJet", "UK": "Vistara"}
            parts.append(airline_names.get(v, v))
        else:
            parts.append(f"{k}: {v}")
    if len(parts) == 1:
        return f"Got it — I'll remember that you prefer {parts[0]}."
    else:
        return f"Got it — I'll remember that you prefer {', '.join(parts[:-1])} and {parts[-1]}."


class ChatService:
    def __init__(self, llm_client: Optional[LLMClient]):
        self.llm_client = llm_client

    async def chat(
        self, request: ChatRequest, request_id: str, user_id: Optional[str] = None
    ) -> ChatResponse:
        from app.observability.tracer import ensure_request_context
        from app.observability import tracer
        # Ensure coherent request context (idempotent — preserves middleware trace)
        request_id = ensure_request_context(request_id)
        chat_start = tracer.start_timer()

        if not self.llm_client or not self.llm_client.is_configured():
            tracer.record_router_decision(request_id, "chat_no_llm", reason="llm_not_configured")
            return ChatResponse(
                answer="The AI assistant is not configured. Please set the LLM_API_KEY environment variable.",
                model="none",
                requestId=request_id,
            )

        # ── INPUT GUARDRAILS ────────────────────────────────────────
        input_result = guardrail_service.validate_input(request.message)
        if input_result.blocked:
            refusal = guardrail_service.get_safe_refusal(input_result)
            logger.warning("Input guardrails blocked message: %s", input_result.violations)
            # Chat metadata event
            tracer.record_guardrail_decision(request_id, stage="chat_input", decision="BLOCK", violation_category=input_result.violations[0].violation_type.value if input_result.violations else None)
            return ChatResponse(
                answer=refusal,
                model="guardrail",
                requestId=request_id,
            )

        # Get or create conversation (gracefully handle memory unavailability)
        conversation_id = None
        context_messages = []
        try:
            conversation = await memory_service.get_or_create_conversation(
                user_id=user_id or "anonymous",
                conversation_id=request.conversationId,
            )
            conversation_id = conversation["id"]

            # Retrieve bounded conversation context
            context_messages = await memory_service.get_conversation_context(
                user_id=user_id or "anonymous",
                conversation_id=conversation_id,
            )
        except Exception as e:
            logger.debug("Memory unavailable, proceeding without conversation context: %s", e)
            # Fall back to stateless behavior
            if request.conversationId:
                conversation_id = request.conversationId
            else:
                try:
                    from uuid import uuid4
                    conversation_id = str(uuid4())
                except Exception:
                    pass

        # ── PREFERENCE SAVE / QUERY SHORT-CIRCUIT (AI-6) ─────────────
        # These are handled deterministically without LLM to avoid chain-of-thought leakage
        # and to guarantee grounding (no "I have no access" hallucination).
        # Save intent: persist via memory_service and return concise confirmation.
        # Query intent: load via memory_service and return formatted list or "no saved preferences".
        clean_msg = request.message.strip()
        # Query intent takes precedence over save intent if both match (e.g., "what are my preferences, I prefer direct?")
        # In practice messages are one or the other.
        if user_id and user_id != "anonymous" and _is_preference_query_intent(clean_msg):
            # Load stored preferences deterministically
            try:
                stored = await memory_service.get_preferences(user_id)
            except Exception as e:
                logger.debug("Preference query failed (DB unavailable): %s", e)
                stored = None
            if stored is None:
                # DB unavailable – graceful fallback, do not fabricate
                answer = "Sorry, I'm unable to retrieve your preferences right now. Please try again later."
            elif not stored:
                answer = "You don't have any saved flight preferences yet."
            else:
                answer = _format_preferences_for_display(stored)
            # Persist conversation messages for this turn
            try:
                if conversation_id:
                    await memory_service.save_user_message(conversation_id, request.message)
                    await memory_service.save_assistant_message(conversation_id, answer)
            except Exception as e:
                logger.debug("Could not persist preference query messages: %s", e)
            try:
                from app.observability.events import ObservabilityEvent
                tracer.emit(ObservabilityEvent(
                    request_id=request_id,
                    event_type="router_decision",
                    operation="chat",
                    component="chat",
                    metadata={"conversation_id": conversation_id or "none", "preference_query": True, "model": "memory"},
                ))
            except Exception:
                pass
            return ChatResponse(answer=answer, model="memory", requestId=request_id, conversationId=conversation_id)

        if user_id and user_id != "anonymous" and _is_preference_save_intent(clean_msg):
            extracted = _extract_preferences_from_message(clean_msg)
            if extracted:
                saved = {}
                failed = False
                for k, v in extracted.items():
                    try:
                        await memory_service.set_preference(user_id, k, v)
                        saved[k] = v
                    except ValueError as ve:
                        logger.warning("Invalid preference key %s: %s", k, ve)
                    except Exception as e:
                        logger.warning("Failed to persist preference %s: %s", k, e)
                        failed = True
                        break
                if failed:
                    answer = "Sorry, saving your preferences is temporarily unavailable. Please try again later."
                elif saved:
                    answer = _build_concise_save_confirmation(saved)
                else:
                    # Extraction yielded nothing valid – fall through to normal LLM handling
                    saved = {}
                    answer = None
                if answer is not None:
                    # Persist messages
                    try:
                        if conversation_id:
                            await memory_service.save_user_message(conversation_id, request.message)
                            await memory_service.save_assistant_message(conversation_id, answer)
                    except Exception as e:
                        logger.debug("Could not persist preference save messages: %s", e)
                    try:
                        from app.observability.events import ObservabilityEvent
                        tracer.emit(ObservabilityEvent(
                            request_id=request_id,
                            event_type="router_decision",
                            operation="chat",
                            component="chat",
                            metadata={"conversation_id": conversation_id or "none", "preference_save": True, "saved_keys": list(saved.keys()), "model": "memory"},
                        ))
                    except Exception:
                        pass
                    # Ensure output does not contain internal reasoning leak patterns
                    # Our deterministic answer is already concise and safe
                    return ChatResponse(answer=answer, model="memory", requestId=request_id, conversationId=conversation_id)
            # If extraction yielded nothing, fall through to normal LLM flow

        # Try RAG retrieval for aviation knowledge questions
        rag_context = await self._retrieve_rag_context(request.message)

        # Build the system prompt with optional RAG context
        system_prompt = self._build_system_prompt(rag_context)

        # Build message list: system + conversation history + current user message
        messages: list[LLMMessage] = [
            LLMMessage(role="system", content=system_prompt),
        ]

        # Add conversation history (excluding the current message if it was already saved)
        for msg in context_messages:
            messages.append(LLMMessage(role=msg["role"], content=msg["content"]))

        # Add current user message
        messages.append(LLMMessage(role="user", content=request.message))

        # Persist user message (gracefully handle failure)
        try:
            if conversation_id:
                await memory_service.save_user_message(conversation_id, request.message)
        except Exception as e:
            logger.debug("Could not persist user message: %s", e)

        # Get tool definitions if any tools are registered
        tool_defs = registry.get_definitions() if len(registry) > 0 else None

        try:
            response = await self._agentic_loop(messages, tool_defs)

            # ── OUTPUT GUARDRAILS (with grounding) ─────────────────────
            grounding_context = self._build_chat_grounding_context(messages)
            output_result = guardrail_service.validate_output(
                response.content or "",
                has_tool_data=bool(response.tool_calls),
                grounding_context=grounding_context if grounding_context else None,
            )
            final_answer = output_result.sanitized_text or response.content or "I was unable to generate a response."

            # Persist assistant response (gracefully handle failure)
            try:
                if conversation_id:
                    await memory_service.save_assistant_message(
                        conversation_id, final_answer
                    )
            except Exception as e:
                logger.debug("Could not persist assistant message: %s", e)

            # ── Chat metadata event (no full history) ──────────────
            try:
                from app.observability.events import ObservabilityEvent
                tracer.emit(ObservabilityEvent(
                    request_id=request_id,
                    event_type="router_decision",
                    operation="chat",
                    component="chat",
                    metadata={
                        "conversation_id": conversation_id or "none",
                        "rag_used": bool(rag_context),
                        "has_tools": bool(tool_defs),
                        "model": response.model,
                    }
                ))
            except Exception:
                pass

            return ChatResponse(
                answer=final_answer,
                model=response.model,
                requestId=request_id,
                conversationId=conversation_id,
            )
        except Exception as e:
            from app.observability.events import ObservabilityEvent
            tracer.record_request_failed(request_id, "chat", tracer.elapsed_ms(chat_start), error_category="llm_error")
            logger.exception("LLM call failed")
            return ChatResponse(
                answer="Sorry, the AI assistant encountered an error. Please try again later.",
                model="error",
                requestId=request_id,
                conversationId=conversation_id,
            )

    async def _agentic_loop(
        self,
        messages: list[LLMMessage],
        tool_defs: Optional[list[dict]],
    ) -> LLMResponse:
        """Run the agentic loop: call LLM, execute tools if needed, repeat."""
        registered_tool_names = [t["function"]["name"] for t in tool_defs] if tool_defs else []

        for iteration in range(MAX_TOOL_ITERATIONS):
            response = await self.llm_client.complete(
                messages,
                tools=tool_defs,
            )

            # If no tool calls, return the final response
            if not response.tool_calls:
                return response

            # Append the assistant message with tool calls
            messages.append(
                LLMMessage(
                    role="assistant",
                    content=response.content,
                    tool_calls=[
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.name,
                                "arguments": __import__("json").dumps(tc.arguments),
                            },
                        }
                        for tc in response.tool_calls
                    ],
                )
            )

            # Execute each tool call and append results
            for tc in response.tool_calls:
                # ── TOOL ABUSE PROTECTION ──────────────────────────────
                violation = guardrail_service.validate_tool_call(tc.name, registered_tool_names)
                if violation:
                    logger.warning("Tool abuse blocked: %s", tc.name)
                    messages.append(
                        LLMMessage(
                            role="tool",
                            content=f"Error: {violation.message}",
                            tool_call_id=tc.id,
                        )
                    )
                    continue

                logger.info("Tool call: %s(%s)", tc.name, tc.arguments)
                result = await registry.execute(tc.name, tc.arguments)

                # ── TOOL RESULT AS UNTRUSTED DATA ──────────────────────
                tool_content = result.to_content()
                tool_content = guardrail_service.validate_tool_result(tool_content)

                messages.append(
                    LLMMessage(
                        role="tool",
                        content=tool_content,
                        tool_call_id=tc.id,
                    )
                )

        # If we hit the iteration limit, return last response
        logger.warning("Tool calling loop hit %d iterations", MAX_TOOL_ITERATIONS)
        return response

    async def _retrieve_rag_context(self, query: str) -> str:
        """Retrieve RAG context if the query is suitable for knowledge retrieval."""
        try:
            from app.rag.retriever import should_use_rag, retrieve, format_retrieval_context

            if not should_use_rag(query):
                return ""

            results = await retrieve(query, top_k=3, similarity_threshold=0.3)
            if not results:
                return ""

            context = format_retrieval_context(results)
            logger.info("RAG retrieved %d chunks for query", len(results))
            return context

        except Exception as e:
            logger.warning("RAG retrieval failed (falling back to no-context): %s", e)
            return ""

    def _build_chat_grounding_context(self, messages: list[LLMMessage]) -> dict:
        """Derive grounding availability from tool results in the message history.

        Inspects tool result messages to determine which structured fields are
        actually available vs null. This context is passed to output guardrails
        so hallucinated claims about unavailable fields can be blocked/sanitized.
        """
        import json as _json

        grounding: dict = {}
        has_tracking_tool = False
        has_weather_tool = False
        live_was_available = False
        wind_was_available = False

        for msg in messages:
            if msg.role != "tool" or not msg.content:
                continue
            content = msg.content
            # Track if live position was ever available
            if "live_data_available" in content or "latitude" in content:
                has_tracking_tool = True
                try:
                    data = _json.loads(content) if content.strip().startswith("{") else {}
                    if isinstance(data, dict):
                        live_avail = data.get("live_data_available")
                        if live_avail is True:
                            live_was_available = True
                        # Fallback: check lat/lon directly
                        if data.get("latitude") is not None and data.get("longitude") is not None:
                            live_was_available = True
                        # Check weather fields in tracking response
                        if "windSpeed" in data or "wind_speed" in data:
                            has_weather_tool = True
                            ws = data.get("windSpeed", data.get("wind_speed"))
                            if ws is not None:
                                wind_was_available = True
                except Exception:
                    pass
            if "windSpeed" in content or "wind_speed" in content:
                has_weather_tool = True
                try:
                    data = _json.loads(content) if content.strip().startswith("{") else {}
                    if isinstance(data, dict):
                        ws = data.get("windSpeed", data.get("wind_speed"))
                        if ws is not None:
                            wind_was_available = True
                        # Also check temperature in weather
                        if data.get("temperature") is not None:
                            grounding["temperature"] = data.get("temperature")
                except Exception:
                    pass

        # Only add grounding entries if relevant tools were called
        if has_tracking_tool:
            grounding["live"] = True if live_was_available else None
            # If live was null, altitude/speed from live are also null
            grounding["altitude"] = None if not live_was_available else True
            if not live_was_available:
                # Keep live as None so position claims are flagged
                pass

        if has_weather_tool and not wind_was_available:
            grounding["windSpeed"] = None
            # Also mark altitude/speed as available only if live was
        # ── FLIGHT STATUS GROUNDING (field-specific) ─────────────────
        # Extract flight-status fields so departureDelay vs arrivalDelay are
        # validated separately, and terminal/gate/status claims are grounded.
        # This prevents cross-field reuse (e.g., arrival delay 4 → departure delay 4).
        flight_fields = [
            "departureDelay", "arrivalDelay",
            "departureScheduled", "departureActual", "arrivalScheduled", "arrivalActual",
            "departureTerminal", "departureGate", "arrivalTerminal", "arrivalGate",
            "status", "flightNumber",
            "terminal", "gate",  # generic fallback for simple tool payloads
        ]
        # Collect from any tool result that looks like a flight DTO
        for msg in messages:
            if msg.role != "tool" or not msg.content:
                continue
            content = msg.content
            # Only try to parse JSON tool results
            stripped = content.strip()
            if not stripped.startswith("{"):
                continue
            try:
                data = _json.loads(content)
            except Exception:
                continue
            if not isinstance(data, dict):
                continue
            # Detect flight status payload (FlightDto or FlightTrackingDto)
            # Keys are camelCase: departureDelay, arrivalDelay, etc.
            has_flight_keys = any(k in data for k in ("departureDelay", "arrivalDelay", "departureScheduled", "flightNumber", "status"))
            # Also handle nested single-flight search wrapper: {"flights":[{...}]}
            if not has_flight_keys and "flights" in data and isinstance(data["flights"], list) and data["flights"]:
                # Use first flight for grounding (status request is single flight)
                first = data["flights"][0] if isinstance(data["flights"][0], dict) else {}
                if any(k in first for k in ("departureDelay", "arrivalDelay")):
                    data = first
                    has_flight_keys = True
                else:
                    continue
            if not has_flight_keys:
                continue
            # Map each flight field into grounding
            for field in flight_fields:
                # Generic terminal/gate fallback: map to specific terminals if available
                if field == "terminal":
                    dep_t = data.get("departureTerminal")
                    arr_t = data.get("arrivalTerminal")
                    # If both terminals are null, terminal is unavailable → any "Terminal X" is hallucination
                    if dep_t is None and arr_t is None:
                        grounding["terminal"] = None
                    else:
                        # At least one terminal present → consider terminal claims grounded (avoid false positive)
                        # Store as True so sanitization doesn't trigger for unavailable check
                        grounding["terminal"] = True
                    continue
                if field == "gate":
                    dep_g = data.get("departureGate")
                    arr_g = data.get("arrivalGate")
                    if dep_g is None and arr_g is None:
                        grounding["gate"] = None
                    else:
                        grounding["gate"] = True
                    continue
                # Direct field mapping
                if field in data:
                    # Keep original value (String or null). For delay fields, keep string like "45"/"4"
                    # For timestamps, keep ISO string; grounding check uses pattern presence + mismatch for delays
                    grounding[field] = data.get(field)
                # Also map snake_case variants if provider ever uses them
                # (e.g., departure_delay) – normalize
                snake = "".join(["_" + c.lower() if c.isupper() else c for c in field]).lstrip("_")
                if snake in data and field not in grounding:
                    grounding[field] = data.get(snake)

        # Price/prediction are never available via chat tools — if LLM
        # tries to claim them, it's always a hallucination. Only flag if
        # output actually tries to claim them, so mark as unavailable
        # generically:
        grounding["price"] = None
        grounding["delay_probability"] = None

        # Keep grounding entries that are None (hallucination check) or numeric/str values for mismatch.
        # For flight delays, keep string values like "45"/"4" as they are comparable as numeric.
        # For terminals/gates/status, keep None vs actual string.
        filtered = {}
        for k, v in grounding.items():
            if v is None or v is False:
                filtered[k] = v
            elif isinstance(v, (int, float)):
                filtered[k] = v
            elif isinstance(v, str) and v.strip() != "" and v.strip().lower() not in ("null", "none"):
                # Keep flight string fields (delays, terminals, gates, status, timestamps)
                # Delays are kept as strings for numeric comparison; timestamps/terminals for existence check
                filtered[k] = v
            elif v is True:
                # Marker for generic terminal/gate available – keep only if you want to allow claims
                # But for grounding, True means "available" – we drop it so it doesn't trigger unavailable block.
                # So skip True entries (they indicate no violation)
                continue
            # Drop empty strings / True markers
        return filtered

    def _build_system_prompt(self, rag_context: str) -> str:
        """Build the system prompt, optionally including RAG context."""
        if not rag_context:
            return SYSTEM_PROMPT

        return f"""{SYSTEM_PROMPT}

RETRIEVED AVIATION KNOWLEDGE:
The following reference material was retrieved from the aviation knowledge base.
Use it to answer the user's question when relevant. If the retrieved context does not
contain information relevant to the question, answer from your general knowledge.
Do not claim the retrieved context says something it does not.

---
{rag_context}
---
"""
