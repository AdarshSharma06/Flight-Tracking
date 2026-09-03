"""Chat endpoint for AI aviation assistant."""

from fastapi import APIRouter, Request

from app.api.models import ChatRequest, ChatResponse
from app.api.chat_service import ChatService
from app.llm import create_llm_client

router = APIRouter(tags=["chat"])

_llm_client = None
_chat_service = None


def _get_chat_service() -> ChatService:
    global _llm_client, _chat_service
    if _chat_service is None:
        _llm_client = create_llm_client()
        _chat_service = ChatService(_llm_client)
    return _chat_service


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, http_request: Request):
    request_id = getattr(http_request.state, "request_id", "unknown")
    service = _get_chat_service()
    return await service.chat(request, request_id)
