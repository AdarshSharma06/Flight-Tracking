"""OpenAI-compatible LLM provider using httpx with tool calling support."""

import json
import logging
from typing import Any, Optional

import httpx

from app.llm.base import LLMClient, LLMMessage, LLMResponse, ToolCall

logger = logging.getLogger(__name__)

# Prompt version for observability
PROMPT_VERSION = "ai-10-v1"


class OpenAICompatibleClient(LLMClient):
    """LLM client for OpenAI-compatible APIs (OpenAI, Azure, Ollama, OpenRouter, etc.)."""

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.openai.com/v1",
        default_model: str = "gpt-4o-mini",
    ):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.default_model = default_model
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            timeout=httpx.Timeout(90.0, connect=10.0),
        )

    async def complete(
        self,
        messages: list[LLMMessage],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        tools: Optional[list[dict[str, Any]]] = None,
    ) -> LLMResponse:
        model = model or self.default_model

        # ── Observability: LLM start ──────────────────────────────
        from app.observability.context import get_request_id
        from app.observability import tracer
        from app.observability.cost import estimate_cost
        from app.config import get_settings
        request_id = get_request_id() or "unknown"
        settings = None
        try:
            settings = get_settings()
        except Exception:
            pass
        prompt_version = getattr(settings, "prompt_version", PROMPT_VERSION) if settings else PROMPT_VERSION
        # Never log full prompts — only metadata
        tracer.record_llm_started(request_id, model=model, provider=self.base_url, prompt_version=prompt_version)
        start = tracer.start_timer()

        payload: dict[str, Any] = {
            "model": model,
            "messages": [m.to_dict() for m in messages],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"

        try:
            response = await self._client.post("/chat/completions", json=payload)
            response.raise_for_status()
            data = response.json()

            choice = data["choices"][0]
            message = choice["message"]
            usage = data.get("usage", {})

            content = message.get("content")
            finish_reason = choice.get("finish_reason")

            tool_calls: list[ToolCall] = []
            if message.get("tool_calls"):
                for tc in message["tool_calls"]:
                    fn = tc.get("function", {})
                    args_raw = fn.get("arguments", "{}")
                    try:
                        args = json.loads(args_raw) if isinstance(args_raw, str) else args_raw
                    except json.JSONDecodeError:
                        args = {}
                    tool_calls.append(
                        ToolCall(
                            id=tc.get("id", ""),
                            name=fn.get("name", ""),
                            arguments=args,
                        )
                    )

            llm_response = LLMResponse(
                content=content,
                model=data.get("model", model),
                tool_calls=tool_calls,
                finish_reason=finish_reason,
                usage={
                    "prompt_tokens": usage.get("prompt_tokens", 0),
                    "completion_tokens": usage.get("completion_tokens", 0),
                    "total_tokens": usage.get("total_tokens", 0),
                },
            )
            duration_ms = tracer.elapsed_ms(start)
            pt = llm_response.usage.get("prompt_tokens", 0)
            ct = llm_response.usage.get("completion_tokens", 0)
            tt = llm_response.usage.get("total_tokens", 0)
            # Honest unavailable: if all zero, represent as unavailable (None)
            has_usage = any([pt, ct, tt])
            est_cost = estimate_cost(pt, ct, settings) if has_usage else None
            tracer.record_llm_completed(
                request_id, model=llm_response.model, duration_ms=duration_ms, success=True,
                prompt_tokens=pt if has_usage else None,
                completion_tokens=ct if has_usage else None,
                total_tokens=tt if has_usage else None,
                estimated_cost=est_cost,
                prompt_version=prompt_version,
            )
            return llm_response
        except httpx.TimeoutException:
            duration_ms = tracer.elapsed_ms(start)
            tracer.record_llm_completed(request_id, model=model, duration_ms=duration_ms, success=False, prompt_version=prompt_version)
            logger.error("LLM request timed out")
            raise
        except httpx.HTTPStatusError as e:
            duration_ms = tracer.elapsed_ms(start)
            tracer.record_llm_completed(request_id, model=model, duration_ms=duration_ms, success=False, prompt_version=prompt_version)
            logger.error("LLM API error: %s - %s", e.response.status_code, e.response.text[:200])
            raise
        except Exception as e:
            duration_ms = tracer.elapsed_ms(start)
            tracer.record_llm_completed(request_id, model=model, duration_ms=duration_ms, success=False, prompt_version=prompt_version)
            logger.error("Unexpected LLM error: %s", e)
            raise

    def is_configured(self) -> bool:
        return bool(self.api_key)

    async def close(self):
        await self._client.aclose()
