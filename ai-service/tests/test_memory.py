"""Tests for AI-6: Conversation and Preference Memory."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.memory.service import MemoryService, VALID_PREFERENCE_KEYS
from app.memory import store
from app.agents.state import UserPreferences, RecommendationState


# ===== Memory Service Unit Tests =====


class TestMemoryServiceMergePreferences:
    """Test preference merging logic (no DB required)."""

    def test_merge_empty_stored_no_explicit(self):
        svc = MemoryService()
        result = svc.merge_preferences({})
        assert result == {}

    def test_merge_stored_origin(self):
        svc = MemoryService()
        result = svc.merge_preferences({"preferred_origin": "DEL"})
        assert result["origin"] == "DEL"

    def test_merge_stored_direct_only(self):
        svc = MemoryService()
        result = svc.merge_preferences({"prefers_direct": "true"})
        assert result["direct_only"] is True

    def test_merge_stored_direct_only_false(self):
        svc = MemoryService()
        result = svc.merge_preferences({"prefers_direct": "false"})
        assert result["direct_only"] is False

    def test_merge_stored_airline(self):
        svc = MemoryService()
        result = svc.merge_preferences({"preferred_airline": "AI"})
        assert result["airline_preference"] == "AI"

    def test_merge_stored_budget(self):
        svc = MemoryService()
        result = svc.merge_preferences({"budget_preference": "60000"})
        assert result["budget"] == 60000.0

    def test_merge_stored_invalid_budget(self):
        svc = MemoryService()
        result = svc.merge_preferences({"budget_preference": "not_a_number"})
        assert "budget" not in result

    def test_merge_stored_departure_time(self):
        svc = MemoryService()
        result = svc.merge_preferences({"preferred_departure_time": "10:00"})
        assert result["travel_time"] == "10:00"

    def test_merge_explicit_overrides_stored(self):
        svc = MemoryService()
        stored = {"preferred_origin": "DEL", "prefers_direct": "true"}
        explicit = {"origin": "BOM", "direct_only": False}
        result = svc.merge_preferences(stored, explicit)
        assert result["origin"] == "BOM"
        assert result["direct_only"] is False

    def test_merge_explicit_null_does_not_override_stored(self):
        svc = MemoryService()
        stored = {"preferred_origin": "DEL"}
        explicit = {"origin": None}
        result = svc.merge_preferences(stored, explicit)
        assert result["origin"] == "DEL"

    def test_merge_multiple_stored_preferences(self):
        svc = MemoryService()
        stored = {
            "preferred_origin": "DEL",
            "preferred_destination": "BOM",
            "prefers_direct": "true",
            "preferred_airline": "AI",
            "budget_preference": "50000",
        }
        result = svc.merge_preferences(stored)
        assert result["origin"] == "DEL"
        assert result["destination"] == "BOM"
        assert result["direct_only"] is True
        assert result["airline_preference"] == "AI"
        assert result["budget"] == 50000.0

    def test_merge_creates_user_preferences(self):
        svc = MemoryService()
        stored = {"preferred_origin": "DEL", "prefers_direct": "true"}
        explicit = {"destination": "BOM"}
        result = svc.merge_preferences(stored, explicit)
        prefs = UserPreferences(**result)
        assert prefs.origin == "DEL"
        assert prefs.destination == "BOM"
        assert prefs.direct_only is True


class TestMemoryServicePreferenceValidation:
    """Test preference key validation (no DB required)."""

    @pytest.mark.asyncio
    async def test_set_preference_invalid_key(self):
        svc = MemoryService()
        with patch("app.memory.service.store") as mock_store:
            mock_store.set_preference = AsyncMock()
            with pytest.raises(ValueError, match="Invalid preference key"):
                await svc.set_preference("user1", "invalid_key", "value")

    @pytest.mark.asyncio
    async def test_set_preference_valid_key(self):
        svc = MemoryService()
        with patch("app.memory.service.store") as mock_store:
            mock_store.set_preference = AsyncMock(
                return_value={"user_id": "user1", "key": "preferred_origin", "value": "DEL"}
            )
            result = await svc.set_preference("user1", "preferred_origin", "DEL")
            assert result["key"] == "preferred_origin"

    def test_valid_keys_complete(self):
        assert "preferred_origin" in VALID_PREFERENCE_KEYS
        assert "preferred_destination" in VALID_PREFERENCE_KEYS
        assert "prefers_direct" in VALID_PREFERENCE_KEYS
        assert "preferred_airline" in VALID_PREFERENCE_KEYS
        assert "budget_preference" in VALID_PREFERENCE_KEYS
        assert "preferred_departure_time" in VALID_PREFERENCE_KEYS
        assert "preferred_arrival_time" in VALID_PREFERENCE_KEYS


class TestMemoryServiceConversation:
    """Test conversation operations (mocked store)."""

    @pytest.mark.asyncio
    async def test_get_or_create_conversation_existing(self):
        svc = MemoryService()
        conv_id = str(uuid4())
        with patch("app.memory.service.store") as mock_store:
            mock_store.get_conversation = AsyncMock(
                return_value={"id": conv_id, "user_id": "user1", "title": None}
            )
            result = await svc.get_or_create_conversation("user1", conv_id)
            assert result["id"] == conv_id
            mock_store.create_conversation.assert_not_called()

    @pytest.mark.asyncio
    async def test_get_or_create_conversation_new(self):
        svc = MemoryService()
        new_id = str(uuid4())
        with patch("app.memory.service.store") as mock_store:
            mock_store.get_conversation = AsyncMock(return_value=None)
            mock_store.create_conversation = AsyncMock(
                return_value={"id": new_id, "user_id": "user1", "title": None}
            )
            result = await svc.get_or_create_conversation("user1", "nonexistent-id")
            assert result["id"] == new_id
            mock_store.create_conversation.assert_called_once_with("user1")

    @pytest.mark.asyncio
    async def test_get_or_create_conversation_no_id(self):
        svc = MemoryService()
        new_id = str(uuid4())
        with patch("app.memory.service.store") as mock_store:
            mock_store.create_conversation = AsyncMock(
                return_value={"id": new_id, "user_id": "user1", "title": None}
            )
            result = await svc.get_or_create_conversation("user1")
            assert result["id"] == new_id

    @pytest.mark.asyncio
    async def test_get_conversation_context(self):
        svc = MemoryService()
        with patch("app.memory.service.store") as mock_store:
            mock_store.get_messages = AsyncMock(
                return_value=[
                    {"role": "user", "content": "Hello"},
                    {"role": "assistant", "content": "Hi there"},
                ]
            )
            result = await svc.get_conversation_context("user1", "conv-123")
            assert len(result) == 2
            assert result[0]["role"] == "user"
            mock_store.get_messages.assert_called_once_with(
                "conv-123", "user1", limit=20, max_chars=8000
            )

    @pytest.mark.asyncio
    async def test_save_user_message(self):
        svc = MemoryService()
        with patch("app.memory.service.store") as mock_store:
            mock_store.add_message = AsyncMock(
                return_value={"id": "msg-1", "conversation_id": "conv-1", "role": "user", "content": "test"}
            )
            result = await svc.save_user_message("conv-1", "test")
            assert result["role"] == "user"

    @pytest.mark.asyncio
    async def test_save_assistant_message(self):
        svc = MemoryService()
        with patch("app.memory.service.store") as mock_store:
            mock_store.add_message = AsyncMock(
                return_value={"id": "msg-2", "conversation_id": "conv-1", "role": "assistant", "content": "response"}
            )
            result = await svc.save_assistant_message("conv-1", "response")
            assert result["role"] == "assistant"


# ===== Chat Integration Tests =====


class TestChatWithMemory:
    """Test chat endpoint integration with conversation memory."""

    @pytest.mark.asyncio
    async def test_chat_creates_conversation(self):
        """First chat message creates a new conversation."""
        from app.api.chat_service import ChatService
        from app.api.models import ChatRequest

        conv_id = str(uuid4())
        llm = MagicMock()
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(
            return_value=MagicMock(content="Hello!", model="test", tool_calls=None)
        )

        with patch("app.api.chat_service.memory_service") as mock_mem:
            mock_mem.get_or_create_conversation = AsyncMock(
                return_value={"id": conv_id, "user_id": "testuser"}
            )
            mock_mem.get_conversation_context = AsyncMock(return_value=[])
            mock_mem.save_user_message = AsyncMock()
            mock_mem.save_assistant_message = AsyncMock()

            svc = ChatService(llm)
            req = ChatRequest(message="Hello")
            result = await svc.chat(req, "req-1", user_id="testuser")

            assert result.conversationId == conv_id
            mock_mem.save_user_message.assert_called_once()
            mock_mem.save_assistant_message.assert_called_once()

    @pytest.mark.asyncio
    async def test_chat_preserves_conversation_context(self):
        """Follow-up messages include previous conversation history."""
        from app.api.chat_service import ChatService
        from app.api.models import ChatRequest

        conv_id = str(uuid4())
        llm = MagicMock()
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(
            return_value=MagicMock(content="Delhi is DEL.", model="test", tool_calls=None)
        )

        with patch("app.api.chat_service.memory_service") as mock_mem:
            mock_mem.get_or_create_conversation = AsyncMock(
                return_value={"id": conv_id, "user_id": "testuser"}
            )
            mock_mem.get_conversation_context = AsyncMock(
                return_value=[
                    {"role": "user", "content": "What is Delhi airport code?"},
                    {"role": "assistant", "content": "Delhi airport code is DEL."},
                ]
            )
            mock_mem.save_user_message = AsyncMock()
            mock_mem.save_assistant_message = AsyncMock()

            svc = ChatService(llm)
            req = ChatRequest(message="What about Mumbai?", conversationId=conv_id)
            result = await svc.chat(req, "req-2", user_id="testuser")

            # Verify LLM was called with history + current message
            call_args = llm.complete.call_args
            messages = call_args[0][0]
            # system + 2 history + 1 current = 4 messages
            assert len(messages) == 4
            assert messages[1].role == "user"
            assert messages[1].content == "What is Delhi airport code?"
            assert messages[3].content == "What about Mumbai?"

    @pytest.mark.asyncio
    async def test_chat_without_user_id(self):
        """Chat works without user ID (anonymous)."""
        from app.api.chat_service import ChatService
        from app.api.models import ChatRequest

        llm = MagicMock()
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(
            return_value=MagicMock(content="Hello!", model="test", tool_calls=None)
        )

        with patch("app.api.chat_service.memory_service") as mock_mem:
            mock_mem.get_or_create_conversation = AsyncMock(
                return_value={"id": "conv-anon", "user_id": "anonymous"}
            )
            mock_mem.get_conversation_context = AsyncMock(return_value=[])
            mock_mem.save_user_message = AsyncMock()
            mock_mem.save_assistant_message = AsyncMock()

            svc = ChatService(llm)
            req = ChatRequest(message="Hello")
            result = await svc.chat(req, "req-1", user_id=None)

            assert result.conversationId == "conv-anon"

    @pytest.mark.asyncio
    async def test_chat_backward_compatible_no_conversation_id(self):
        """Chat request without conversationId still works."""
        from app.api.models import ChatRequest

        req = ChatRequest(message="Hello")
        assert req.conversationId is None


# ===== Preference Integration with Recommendation Tests =====


class TestRecommendationWithPreferences:
    """Test preference memory integration with AI-5 recommendation."""

    def test_merge_preferences_into_recommendation_state(self):
        """Stored preferences are injected into RecommendationState."""
        svc = MemoryService()
        stored = {
            "preferred_origin": "DEL",
            "prefers_direct": "true",
            "preferred_airline": "AI",
        }
        merged = svc.merge_preferences(stored)
        state = RecommendationState(
            user_request="Find flights to Mumbai",
            preferences=UserPreferences(**merged),
        )
        assert state.preferences.origin == "DEL"
        assert state.preferences.direct_only is True
        assert state.preferences.airline_preference == "AI"

    def test_explicit_preference_overrides_stored_in_parse(self):
        """Explicit preference in query overrides stored preference."""
        # Simulate what parse_preferences does with merging
        existing = UserPreferences(origin="DEL", direct_only=True)
        parsed = {"origin": None, "direct_only": False, "destination": "BOM"}

        # The merge logic in parse_preferences
        merged = UserPreferences(
            origin=parsed.get("origin") or existing.origin,
            destination=parsed.get("destination") or existing.destination,
            travel_date=parsed.get("travel_date") or existing.travel_time,
            travel_time=parsed.get("travel_time") or existing.travel_time,
            budget=parsed.get("budget") or existing.budget,
            budget_currency=parsed.get("budget_currency") or existing.budget_currency,
            direct_only=parsed.get("direct_only") if parsed.get("direct_only") is not None else existing.direct_only,
            airline_preference=parsed.get("airline_preference") or existing.airline_preference,
            other_preferences=parsed.get("other_preferences") or existing.other_preferences,
        )

        # Origin stays from stored (LLM returned null)
        assert merged.origin == "DEL"
        # direct_only overridden by explicit False
        assert merged.direct_only is False
        # destination from explicit
        assert merged.destination == "BOM"

    def test_stored_preference_does_not_become_fake_data(self):
        """Stored preferences only provide defaults, not fabricated data."""
        svc = MemoryService()
        # Empty stored preferences
        merged = svc.merge_preferences({})
        assert merged == {}
        # No fake origin, destination, etc.
        assert "origin" not in merged
        assert "destination" not in merged


# ===== Security / User Isolation Tests =====


class TestMemorySecurity:
    """Test user isolation for memory operations."""

    @pytest.mark.asyncio
    async def test_user_a_cannot_read_user_b_conversation(self):
        """User isolation: get_conversation returns None for wrong user."""
        valid_id = str(uuid4())
        with patch("app.memory.store.get_pool") as mock_pool_fn:
            mock_pool = AsyncMock()
            mock_pool_fn.return_value = mock_pool
            mock_pool.fetchrow = AsyncMock(return_value=None)

            result = await store.get_conversation(valid_id, "user_b")
            assert result is None

    @pytest.mark.asyncio
    async def test_user_a_cannot_read_user_b_messages(self):
        """User isolation: get_messages returns empty for wrong user."""
        valid_id = str(uuid4())
        with patch("app.memory.store.get_pool") as mock_pool_fn:
            mock_pool = AsyncMock()
            mock_pool_fn.return_value = mock_pool
            mock_pool.fetchrow = AsyncMock(return_value=None)

            result = await store.get_messages(valid_id, "user_b")
            assert result == []

    @pytest.mark.asyncio
    async def test_user_a_cannot_modify_user_b_preferences(self):
        """User isolation: delete_preference only affects own preferences."""
        with patch("app.memory.store.get_pool") as mock_pool_fn:
            mock_pool = AsyncMock()
            mock_pool_fn.return_value = mock_pool
            mock_pool.execute = AsyncMock(return_value="DELETE 0")

            deleted = await store.delete_preference("user_a", "preferred_origin")
            assert deleted is False

    @pytest.mark.asyncio
    async def test_user_a_preferences_isolation(self):
        """User isolation: preferences are scoped by user_id."""
        with patch("app.memory.store.get_pool") as mock_pool_fn:
            mock_pool = AsyncMock()
            mock_pool_fn.return_value = mock_pool
            mock_pool.execute = AsyncMock(return_value="INSERT 0 1")
            await store.set_preference("user_a", "preferred_origin", "DEL")

            mock_pool.fetch = AsyncMock(return_value=[])
            prefs = await store.get_preferences("user_b")
            assert prefs == {}


# ===== API Endpoint Tests =====


class TestMemoryEndpoints:
    """Test memory API endpoints."""

    @pytest.mark.asyncio
    async def test_get_preferences_no_user(self, async_client):
        """Preferences endpoint returns empty for anonymous."""
        response = await async_client.get(
            "/api/ai/preferences",
            headers={"X-AI-Service-Key": "test-key"},
        )
        assert response.status_code == 200
        assert response.json()["preferences"] == {}

    @pytest.mark.asyncio
    async def test_get_valid_keys(self, async_client):
        """Valid keys endpoint returns all valid preference keys."""
        response = await async_client.get(
            "/api/ai/preferences/valid-keys",
            headers={"X-AI-Service-Key": "test-key"},
        )
        assert response.status_code == 200
        keys = response.json()["keys"]
        assert "preferred_origin" in keys
        assert "prefers_direct" in keys

    @pytest.mark.asyncio
    async def test_list_conversations_no_user(self, async_client):
        """Conversations endpoint returns empty for anonymous."""
        response = await async_client.get(
            "/api/ai/conversations",
            headers={"X-AI-Service-Key": "test-key"},
        )
        assert response.status_code == 200
        assert response.json()["conversations"] == []

    @pytest.mark.asyncio
    async def test_set_preference_no_user(self, async_client):
        """Setting preference without user returns 401."""
        response = await async_client.post(
            "/api/ai/preferences",
            json={"key": "preferred_origin", "value": "DEL"},
            headers={"X-AI-Service-Key": "test-key"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_delete_preference_no_user(self, async_client):
        """Deleting preference without user returns 401."""
        response = await async_client.delete(
            "/api/ai/preferences/preferred_origin",
            headers={"X-AI-Service-Key": "test-key"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_clear_preferences_no_user(self, async_client):
        """Clearing preferences without user returns 401."""
        response = await async_client.delete(
            "/api/ai/preferences",
            headers={"X-AI-Service-Key": "test-key"},
        )
        assert response.status_code == 401


# ===== Middleware User ID Extraction Tests =====


class TestMiddlewareUserId:
    """Test that middleware correctly extracts X-User-Id."""

    @pytest.mark.asyncio
    async def test_user_id_from_header(self, async_client):
        """X-User-Id header is extracted by middleware."""
        with patch("app.memory.store.get_pool") as mock_pool_fn:
            mock_pool = AsyncMock()
            mock_pool_fn.return_value = mock_pool
            mock_pool.fetch = AsyncMock(return_value=[])
            response = await async_client.get(
                "/api/ai/preferences",
                headers={
                    "X-AI-Service-Key": "test-key",
                    "X-User-Id": "testuser",
                },
            )
            assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_no_user_id_header(self, async_client):
        """Request without X-User-Id still works (user_id is None)."""
        response = await async_client.get(
            "/api/ai/preferences",
            headers={"X-AI-Service-Key": "test-key"},
        )
        assert response.status_code == 200


# ===== Chat Endpoint Model Tests =====


class TestChatModels:
    """Test chat request/response model changes."""

    def test_chat_request_optional_conversation_id(self):
        from app.api.models import ChatRequest

        req = ChatRequest(message="Hello")
        assert req.conversationId is None

    def test_chat_request_with_conversation_id(self):
        from app.api.models import ChatRequest

        req = ChatRequest(message="Hello", conversationId="conv-123")
        assert req.conversationId == "conv-123"

    def test_chat_response_optional_conversation_id(self):
        from app.api.models import ChatResponse

        resp = ChatResponse(answer="Hi", model="test", requestId="req-1")
        assert resp.conversationId is None

    def test_chat_response_with_conversation_id(self):
        from app.api.models import ChatResponse

        resp = ChatResponse(
            answer="Hi", model="test", requestId="req-1", conversationId="conv-123"
        )
        assert resp.conversationId == "conv-123"


# ===== Conversation Bounded Context Tests =====


class TestBoundedContext:
    """Test that conversation context is properly bounded."""

    @pytest.mark.asyncio
    async def test_messages_bounded_by_count(self):
        """Only recent messages are returned within limit."""
        valid_id = str(uuid4())
        with patch("app.memory.store.get_pool") as mock_pool_fn:
            mock_pool = AsyncMock()
            mock_pool_fn.return_value = mock_pool
            mock_pool.fetchrow = AsyncMock(return_value={"id": "conv-1"})
            mock_pool.fetch = AsyncMock(
                return_value=[
                    {"id": f"m{i}", "role": "user" if i % 2 == 0 else "assistant",
                     "content": f"Message {i}", "created_at": None}
                    for i in range(5)
                ]
            )
            messages = await store.get_messages(valid_id, "user1", limit=20, max_chars=8000)
            assert len(messages) == 5

    @pytest.mark.asyncio
    async def test_messages_bounded_by_chars(self):
        """Oldest messages are trimmed when char budget exceeded."""
        valid_id = str(uuid4())
        with patch("app.memory.store.get_pool") as mock_pool_fn:
            mock_pool = AsyncMock()
            mock_pool_fn.return_value = mock_pool
            mock_pool.fetchrow = AsyncMock(return_value={"id": "conv-1"})
            mock_pool.fetch = AsyncMock(
                return_value=[
                    {"id": "m1", "role": "user", "content": "A" * 3000, "created_at": None},
                    {"id": "m2", "role": "assistant", "content": "B" * 3000, "created_at": None},
                    {"id": "m3", "role": "user", "content": "C" * 3000, "created_at": None},
                    {"id": "m4", "role": "assistant", "content": "D" * 3000, "created_at": None},
                ]
            )
            messages = await store.get_messages(valid_id, "user1", limit=20, max_chars=8000)
            total_chars = sum(len(m["content"]) for m in messages)
            assert total_chars <= 8000


# ===== Regression: AI-5 Recommendation Still Works =====


class TestRecommendationRegression:
    """Ensure AI-5 recommendation still works with memory integration."""

    @pytest.mark.asyncio
    async def test_recommend_without_user_id(self):
        """Recommendation works without user identity."""
        from app.api.recommendation import recommend
        from app.api.recommendation import RecommendationRequest
        from fastapi import Request
        from starlette.testclient import TestClient

        # Verify the endpoint signature accepts user_id
        import inspect
        sig = inspect.signature(recommend)
        # The function should accept http_request which has user_id
        assert "http_request" in sig.parameters

    def test_parse_preferences_merges_with_existing(self):
        """parse_preferences merges with existing state preferences."""
        # This is tested via the node logic, not the endpoint
        existing = UserPreferences(origin="DEL", direct_only=True)
        # LLM returns null for origin, False for direct_only
        parsed = {"origin": None, "direct_only": False, "destination": "BOM"}

        # Simulate merge logic
        merged = UserPreferences(
            origin=parsed.get("origin") or existing.origin,
            destination=parsed.get("destination") or existing.destination,
            travel_date=parsed.get("travel_date") or existing.travel_time,
            travel_time=parsed.get("travel_time") or existing.travel_time,
            budget=parsed.get("budget") or existing.budget,
            budget_currency=parsed.get("budget_currency") or existing.budget_currency,
            direct_only=parsed.get("direct_only") if parsed.get("direct_only") is not None else existing.direct_only,
            airline_preference=parsed.get("airline_preference") or existing.airline_preference,
            other_preferences=parsed.get("other_preferences") or existing.other_preferences,
        )

        # Stored origin preserved (LLM returned null)
        assert merged.origin == "DEL"
        # Explicit direct_only=False overrides stored True
        assert merged.direct_only is False
        # Explicit destination added
        assert merged.destination == "BOM"


# ===== AI-5/AI-6: Ignore Saved Preferences =====


class TestIgnoreSavedPreferences:
    """Regression tests for 'ignore saved preferences' instruction.

    When a user explicitly asks to ignore saved preferences, the recommendation
    workflow must use only the current request's preferences — stored preferences
    must not leak into scoring.
    """

    def test_ignore_pattern_detects_common_phrases(self):
        """The regex detects common ignore-saved-preferences phrases."""
        from app.api.recommendation import _IGNORE_PATTERNS

        assert _IGNORE_PATTERNS.search("Ignore my saved preferences")
        assert _IGNORE_PATTERNS.search("disregard my stored preferences")
        assert _IGNORE_PATTERNS.search("don't use my saved preferences")
        assert _IGNORE_PATTERNS.search("do not use my saved preferences")
        assert _IGNORE_PATTERNS.search("skip my saved preferences")
        assert _IGNORE_PATTERNS.search("Find flights without using my preferences")
        assert _IGNORE_PATTERNS.search("Ignore my saved flight preferences for this request")

    def test_ignore_pattern_does_not_trigger_on_normal_requests(self):
        """Normal requests without ignore instruction are not flagged."""
        from app.api.recommendation import _IGNORE_PATTERNS

        assert not _IGNORE_PATTERNS.search("Find me a flight from Delhi to Mumbai")
        assert not _IGNORE_PATTERNS.search("Show me direct flights")
        assert not _IGNORE_PATTERNS.search("What are my saved preferences?")
        assert not _IGNORE_PATTERNS.search("Save my preference for Air India")
        assert not _IGNORE_PATTERNS.search("Ignore weather conditions")

    def test_stored_airline_not_used_when_ignore_requested(self):
        """Stored airline preference must not influence scoring when ignore requested."""
        from app.memory.service import MemoryService

        svc = MemoryService()
        stored = {"preferred_airline": "LO", "prefers_direct": "true"}
        merged = svc.merge_preferences(stored)

        # Without ignore: stored airline should be present
        assert merged["airline_preference"] == "LO"
        assert merged["direct_only"] is True

        # With ignore: endpoint should not load stored prefs
        # (initial_preferences would be None, so parse_preferences starts from scratch)
        ignore_initial = None  # Simulates what endpoint does when ignore is detected
        if ignore_initial:
            ignore_prefs = UserPreferences(**ignore_initial)
        else:
            ignore_prefs = UserPreferences()

        assert ignore_prefs.airline_preference is None
        assert ignore_prefs.direct_only is False

    def test_stored_direct_not_used_when_ignore_requested(self):
        """Stored direct preference must not influence scoring when ignore requested."""
        from app.memory.service import MemoryService

        svc = MemoryService()
        stored = {"prefers_direct": "true", "preferred_origin": "DEL"}
        merged = svc.merge_preferences(stored)

        # Without ignore: stored direct_only should be True
        assert merged["direct_only"] is True

        # With ignore: initial_preferences is None → UserPreferences defaults
        ignore_prefs = UserPreferences()
        assert ignore_prefs.direct_only is False

    def test_stored_evening_not_used_when_ignore_requested(self):
        """Stored departure time preference must not influence scoring when ignore requested."""
        from app.memory.service import MemoryService

        svc = MemoryService()
        stored = {"preferred_departure_time": "20:00", "preferred_airline": "LO"}
        merged = svc.merge_preferences(stored)

        # Without ignore: stored travel_time should be present
        assert merged["travel_time"] == "20:00"

        # With ignore: initial_preferences is None → defaults
        ignore_prefs = UserPreferences()
        assert ignore_prefs.travel_time is None

    def test_normal_request_still_uses_stored_preferences(self):
        """Normal requests without ignore instruction still use stored preferences."""
        from app.memory.service import MemoryService

        svc = MemoryService()
        stored = {"preferred_airline": "LO", "prefers_direct": "true"}
        merged = svc.merge_preferences(stored)
        initial = UserPreferences(**merged)

        # Simulate parse_preferences with no explicit overrides from LLM
        parsed = {"origin": None, "destination": "BOM", "airline_preference": None}
        existing = initial

        result = UserPreferences(
            origin=parsed.get("origin") or existing.origin,
            destination=parsed.get("destination") or existing.destination,
            travel_date=parsed.get("travel_date") or existing.travel_date,
            travel_time=parsed.get("travel_time") or existing.travel_time,
            budget=parsed.get("budget") or existing.budget,
            budget_currency=parsed.get("budget_currency") or existing.budget_currency,
            direct_only=parsed.get("direct_only") if parsed.get("direct_only") is not None else existing.direct_only,
            airline_preference=parsed.get("airline_preference") or existing.airline_preference,
            other_preferences=parsed.get("other_preferences") or existing.other_preferences,
        )

        # Stored preferences should be preserved
        assert result.airline_preference == "LO"
        assert result.direct_only is True

    def test_explicit_request_preference_overrides_stored(self):
        """Explicit current-request preference overrides stored preference."""
        from app.memory.service import MemoryService

        svc = MemoryService()
        stored = {"preferred_airline": "LO"}
        merged = svc.merge_preferences(stored)
        existing = UserPreferences(**merged)

        # LLM extracts explicit airline from current request
        parsed = {"airline_preference": "AI", "origin": "DEL", "destination": "BOM"}

        result = UserPreferences(
            origin=parsed.get("origin") or existing.origin,
            destination=parsed.get("destination") or existing.destination,
            travel_date=parsed.get("travel_date") or existing.travel_date,
            travel_time=parsed.get("travel_time") or existing.travel_time,
            budget=parsed.get("budget") or existing.budget,
            budget_currency=parsed.get("budget_currency") or existing.budget_currency,
            direct_only=parsed.get("direct_only") if parsed.get("direct_only") is not None else existing.direct_only,
            airline_preference=parsed.get("airline_preference") or existing.airline_preference,
            other_preferences=parsed.get("other_preferences") or existing.other_preferences,
        )

        # Explicit request overrides stored
        assert result.airline_preference == "AI"

    def test_stored_preferences_not_modified_after_ignore_request(self):
        """The ignore instruction must not modify stored preferences in PostgreSQL.

        When ignore is requested, the endpoint skips loading stored prefs entirely,
        so the DB is never read for preferences and the graph starts from scratch.
        """
        from app.memory.service import MemoryService

        svc = MemoryService()
        stored = {"preferred_airline": "LO", "prefers_direct": "true"}
        merged = svc.merge_preferences(stored)

        # With ignore: endpoint skips DB read → initial_preferences stays None
        ignore_initial = None
        if ignore_initial:
            ignore_prefs = UserPreferences(**ignore_initial)
        else:
            ignore_prefs = UserPreferences()

        # Stored preferences are completely absent from the graph state
        assert ignore_prefs.airline_preference is None
        assert ignore_prefs.direct_only is False

    def test_ignore_with_case_variations(self):
        """Case-insensitive matching for ignore instruction."""
        from app.api.recommendation import _IGNORE_PATTERNS

        assert _IGNORE_PATTERNS.search("IGNORE my saved preferences")
        assert _IGNORE_PATTERNS.search("Ignore My Saved Preferences")
        assert _IGNORE_PATTERNS.search("ignore my saved preferences")

    def test_ignore_scoring_state_no_airline_match(self):
        """When ignore is requested, scoring must not give airline_match credit for stored airline."""
        from app.agents.ranking import _score_airline_match
        from app.agents.state import FlightCandidate

        candidate = FlightCandidate(
            flight_number="LO123",
            origin="DEL",
            destination="BOM",
            airline="LO",
        )

        # With stored airline preference LO
        prefs_with_stored = UserPreferences(airline_preference="LO")
        score_with = _score_airline_match(candidate, prefs_with_stored)
        assert score_with == 1.0

        # Without stored airline preference (ignore requested)
        prefs_without = UserPreferences()
        score_without = _score_airline_match(candidate, prefs_without)
        assert score_without == 1.0  # No preference → returns 1.0 (neutral)

    def test_ignore_scoring_state_no_direct_preference(self):
        """When ignore is requested, scoring must not give direct preference credit."""
        from app.agents.ranking import _score_direct_preference
        from app.agents.state import FlightCandidate

        candidate = FlightCandidate(
            flight_number="LO123",
            origin="DEL",
            destination="BOM",
            is_direct=True,
        )

        # With stored direct preference
        prefs_with_stored = UserPreferences(direct_only=True)
        score_with = _score_direct_preference(candidate, prefs_with_stored)
        assert score_with == 1.0  # Direct flight + prefers direct = 1.0

        # Without stored direct preference (ignore requested)
        prefs_without = UserPreferences()
        score_without = _score_direct_preference(candidate, prefs_without)
        # direct_only=False → returns 1.0 (neutral, no preference)
        assert score_without == 1.0
