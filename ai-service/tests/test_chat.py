"""Tests for the chat endpoint."""

import pytest
from unittest.mock import AsyncMock, patch

from app.api.models import ChatRequest, ChatResponse
from app.api.chat_service import ChatService
from app.llm.base import LLMClient, LLMMessage, LLMResponse


class FakeLLMClient(LLMClient):
    """Mock LLM client for testing."""

    def __init__(self, response_text: str = "An airport is a place where flights take off and land."):
        self.response_text = response_text
        self._configured = True

    async def complete(self, messages, model=None, temperature=0.7, max_tokens=1024):
        return LLMResponse(content=self.response_text, model="test-model", usage={})

    def is_configured(self):
        return self._configured


class FailingLLMClient(LLMClient):
    """Mock LLM client that always fails."""

    async def complete(self, messages, model=None, temperature=0.7, max_tokens=1024):
        raise RuntimeError("LLM provider unavailable")

    def is_configured(self):
        return True


class UnconfiguredLLMClient(LLMClient):
    """Mock LLM client that reports not configured."""

    async def complete(self, messages, model=None, temperature=0.7, max_tokens=1024):
        raise RuntimeError("Should not be called")

    def is_configured(self):
        return False


# --- ChatRequest validation ---

def test_chat_request_min_length():
    """Empty message should fail validation."""
    with pytest.raises(Exception):
        ChatRequest(message="")


def test_chat_request_max_length():
    """Message exceeding 4000 chars should fail validation."""
    with pytest.raises(Exception):
        ChatRequest(message="x" * 4001)


def test_chat_request_valid():
    req = ChatRequest(message="What is an airport?")
    assert req.message == "What is an airport?"


# --- ChatResponse shape ---

def test_chat_response_shape():
    resp = ChatResponse(answer="An airport is...", model="gpt-4o-mini", requestId="req-123")
    assert resp.answer == "An airport is..."
    assert resp.model == "gpt-4o-mini"
    assert resp.requestId == "req-123"


# --- ChatService with mocked LLM ---

@pytest.mark.asyncio
async def test_chat_service_successful_response():
    llm = FakeLLMClient("An airport is a facility for aircraft operations.")
    service = ChatService(llm)
    req = ChatRequest(message="What is an airport?")
    resp = await service.chat(req, "req-test-1")
    assert resp.answer == "An airport is a facility for aircraft operations."
    assert resp.model == "test-model"
    assert resp.requestId == "req-test-1"


@pytest.mark.asyncio
async def test_chat_service_unconfigured_llm():
    llm = UnconfiguredLLMClient()
    service = ChatService(llm)
    req = ChatRequest(message="What is an airport?")
    resp = await service.chat(req, "req-test-2")
    assert "not configured" in resp.answer.lower()
    assert resp.model == "none"


@pytest.mark.asyncio
async def test_chat_service_llm_failure():
    llm = FailingLLMClient()
    service = ChatService(llm)
    req = ChatRequest(message="What is an airport?")
    resp = await service.chat(req, "req-test-3")
    assert "error" in resp.answer.lower()
    assert resp.model == "error"


@pytest.mark.asyncio
async def test_chat_service_no_secrets_in_response():
    llm = FakeLLMClient("Response with sk-abc123 secret embedded")
    service = ChatService(llm)
    req = ChatRequest(message="test")
    resp = await service.chat(req, "req-test-4")
    # The response content comes from LLM - we verify the service doesn't add secrets
    assert resp.requestId == "req-test-4"
    # Verify no API key fields in response
    resp_dict = resp.model_dump()
    assert "api_key" not in resp_dict
    assert "apiKey" not in resp_dict
    assert "secret" not in resp_dict


# --- Chat endpoint via test client ---

@pytest.mark.asyncio
async def test_chat_endpoint_request_validation(async_client):
    """Empty message should be rejected by Pydantic validation."""
    response = await async_client.post("/api/ai/chat", json={"message": ""})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_chat_endpoint_missing_message(async_client):
    """Missing message field should be rejected."""
    response = await async_client.post("/api/ai/chat", json={})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_chat_endpoint_no_secret_leakage(async_client):
    """Response should not contain sensitive fields."""
    response = await async_client.post("/api/ai/chat", json={"message": "test"})
    # Will return either 200 (if LLM configured) or 500 (if not)
    # Either way, no secrets should leak
    if response.status_code == 200:
        data = response.json()
        # Check response keys only contain expected fields
        assert set(data.keys()) == {"answer", "model", "requestId"}
        # The answer may mention env var names in error messages (e.g. "set the llm_api_key env var")
        # which is not a secret leak. Verify no actual key values appear.
        assert "sk-" not in data.get("answer", "")
        assert "Bearer " not in data.get("answer", "")
