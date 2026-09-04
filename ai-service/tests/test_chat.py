"""Tests for the chat endpoint."""

import pytest
from unittest.mock import AsyncMock, patch

from app.api.models import ChatRequest, ChatResponse
from app.api.chat_service import ChatService
from app.llm.base import LLMClient, LLMMessage, LLMResponse, ToolCall


class FakeLLMClient(LLMClient):
    """Mock LLM client for testing."""

    def __init__(self, response_text: str = "An airport is a place where flights take off and land."):
        self.response_text = response_text
        self._configured = True

    async def complete(self, messages, model=None, temperature=0.7, max_tokens=1024, tools=None):
        return LLMResponse(content=self.response_text, model="test-model", usage={})

    def is_configured(self):
        return self._configured


class FailingLLMClient(LLMClient):
    """Mock LLM client that always fails."""

    async def complete(self, messages, model=None, temperature=0.7, max_tokens=1024, tools=None):
        raise RuntimeError("LLM provider unavailable")

    def is_configured(self):
        return True


class UnconfiguredLLMClient(LLMClient):
    """Mock LLM client that reports not configured."""

    async def complete(self, messages, model=None, temperature=0.7, max_tokens=1024, tools=None):
        raise RuntimeError("Should not be called")

    def is_configured(self):
        return False


class ToolCallingLLMClient(LLMClient):
    """Mock LLM that makes one tool call then responds."""

    def __init__(self, tool_name: str, tool_args: dict, final_response: str = "Here is the result."):
        self.tool_name = tool_name
        self.tool_args = tool_args
        self.final_response = final_response
        self._call_count = 0
        self._configured = True

    async def complete(self, messages, model=None, temperature=0.7, max_tokens=1024, tools=None):
        self._call_count += 1
        if self._call_count == 1 and tools:
            return LLMResponse(
                content=None,
                model="test-model",
                tool_calls=[
                    ToolCall(
                        id="call_001",
                        name=self.tool_name,
                        arguments=self.tool_args,
                    )
                ],
                finish_reason="tool_calls",
            )
        return LLMResponse(content=self.final_response, model="test-model", usage={})

    def is_configured(self):
        return self._configured


# --- ChatRequest validation ---

def test_chat_request_min_length():
    with pytest.raises(Exception):
        ChatRequest(message="")


def test_chat_request_max_length():
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
    assert resp.requestId == "req-test-4"
    resp_dict = resp.model_dump()
    assert "api_key" not in resp_dict
    assert "apiKey" not in resp_dict
    assert "secret" not in resp_dict


# --- Chat endpoint via test client ---

@pytest.mark.asyncio
async def test_chat_endpoint_request_validation(async_client):
    response = await async_client.post(
        "/api/ai/chat",
        json={"message": ""},
        headers={"X-AI-Service-Key": "test-key"},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_chat_endpoint_missing_message(async_client):
    response = await async_client.post(
        "/api/ai/chat",
        json={},
        headers={"X-AI-Service-Key": "test-key"},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_chat_endpoint_no_secret_leakage(async_client):
    response = await async_client.post("/api/ai/chat", json={"message": "test"})
    if response.status_code == 200:
        data = response.json()
        assert set(data.keys()) == {"answer", "model", "requestId", "conversationId"}
        assert "sk-" not in data.get("answer", "")
        assert "Bearer " not in data.get("answer", "")


# --- AI-3: Tool calling integration ---

@pytest.mark.asyncio
async def test_chat_service_tool_calling_flow():
    """LLM requests a tool, tool executes, LLM responds."""
    llm = ToolCallingLLMClient(
        tool_name="get_flight_status",
        tool_args={"flight_number": "AI302"},
        final_response="Flight AI302 is currently on time.",
    )
    service = ChatService(llm)

    from app.tools.base import ToolResult
    with patch("app.api.chat_service.registry") as mock_reg:
        mock_reg.get_definitions.return_value = [{"type": "function", "function": {"name": "get_flight_status"}}]
        mock_reg.__len__ = lambda self: 1
        mock_reg.execute = AsyncMock(return_value=ToolResult(success=True, data={"status": "active"}))

        req = ChatRequest(message="Is AI302 delayed?")
        resp = await service.chat(req, "req-tool-1")
        assert resp.answer == "Flight AI302 is currently on time."
        assert resp.model == "test-model"
        assert llm._call_count == 2


@pytest.mark.asyncio
async def test_chat_service_non_tool_chat_still_works():
    """Normal chat without tools should work unchanged."""
    llm = FakeLLMClient("ILS stands for Instrument Landing System.")
    service = ChatService(llm)
    req = ChatRequest(message="What is an ILS?")
    resp = await service.chat(req, "req-notool-1")
    assert resp.answer == "ILS stands for Instrument Landing System."


@pytest.mark.asyncio
async def test_chat_service_tool_failure_graceful():
    """Tool failure should be reported to LLM, which gives a response."""
    llm = ToolCallingLLMClient(
        tool_name="get_flight_status",
        tool_args={"flight_number": "INVALID"},
        final_response="I couldn't retrieve flight data.",
    )
    service = ChatService(llm)

    from app.tools.base import ToolResult
    with patch("app.api.chat_service.registry") as mock_reg:
        mock_reg.get_definitions.return_value = [{"type": "function", "function": {"name": "get_flight_status"}}]
        mock_reg.__len__ = lambda self: 1
        mock_reg.execute = AsyncMock(return_value=ToolResult(success=False, error="Flight not found"))

        req = ChatRequest(message="Is flight XYZ999 delayed?")
        resp = await service.chat(req, "req-tool-fail")
        assert resp.answer == "I couldn't retrieve flight data."
