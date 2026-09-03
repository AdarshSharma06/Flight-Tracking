"""Chat service — orchestrates LLM calls for the chat endpoint."""

import logging
from typing import Optional

from app.api.models import ChatRequest, ChatResponse
from app.api.system_prompt import SYSTEM_PROMPT
from app.llm.base import LLMClient, LLMMessage

logger = logging.getLogger(__name__)


class ChatService:
    def __init__(self, llm_client: Optional[LLMClient]):
        self.llm_client = llm_client

    async def chat(self, request: ChatRequest, request_id: str) -> ChatResponse:
        if not self.llm_client or not self.llm_client.is_configured():
            return ChatResponse(
                answer="The AI assistant is not configured. Please set the LLM_API_KEY environment variable.",
                model="none",
                requestId=request_id,
            )

        messages = [
            LLMMessage(role="system", content=SYSTEM_PROMPT),
            LLMMessage(role="user", content=request.message),
        ]

        try:
            response = await self.llm_client.complete(messages)
            return ChatResponse(
                answer=response.content,
                model=response.model,
                requestId=request_id,
            )
        except Exception as e:
            logger.exception("LLM call failed")
            return ChatResponse(
                answer="Sorry, the AI assistant encountered an error. Please try again later.",
                model="error",
                requestId=request_id,
            )
