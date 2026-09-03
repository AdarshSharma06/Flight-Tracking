"""Chat request/response models."""

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000, description="User message")


class ChatResponse(BaseModel):
    answer: str
    model: str
    requestId: str
