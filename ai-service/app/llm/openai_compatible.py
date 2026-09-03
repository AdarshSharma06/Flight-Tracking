"""OpenAI-compatible LLM provider using httpx with tool calling support."""

import json
import logging
from typing import Any, Optional

import httpx

from app.llm.base import LLMClient, LLMMessage, LLMResponse, ToolCall

logger = logging.getLogger(__name__)


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

            return LLMResponse(
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
        except httpx.TimeoutException:
            logger.error("LLM request timed out")
            raise
        except httpx.HTTPStatusError as e:
            logger.error("LLM API error: %s - %s", e.response.status_code, e.response.text[:200])
            raise
        except Exception as e:
            logger.error("Unexpected LLM error: %s", e)
            raise

    def is_configured(self) -> bool:
        return bool(self.api_key)

    async def close(self):
        await self._client.aclose()
