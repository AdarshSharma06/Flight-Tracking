"""Chat request/response models."""

from typing import Optional
from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000, description="User message")
    conversationId: Optional[str] = Field(
        None, description="Optional conversation ID for context continuity"
    )


class ChatResponse(BaseModel):
    answer: str
    model: str
    requestId: str
    conversationId: Optional[str] = Field(
        None, description="Conversation ID for follow-up messages"
    )
