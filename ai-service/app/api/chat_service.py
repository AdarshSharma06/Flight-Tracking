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
