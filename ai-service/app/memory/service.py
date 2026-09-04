"""Memory service — coordinates conversation and preference memory operations.

Provides a clean abstraction over the memory store for use by API endpoints.
Handles user isolation, bounded context retrieval, and preference management.
"""

import logging
from typing import Optional

from app.memory import store

logger = logging.getLogger(__name__)

# Conversation context limits
MAX_CONTEXT_MESSAGES = 20
MAX_CONTEXT_CHARS = 8000

# Valid preference keys and their allowed values
VALID_PREFERENCE_KEYS = {
    "preferred_origin",
    "preferred_destination",
    "prefers_direct",
    "preferred_airline",
    "budget_preference",
    "preferred_departure_time",
    "preferred_arrival_time",
}


class MemoryService:
    """Service layer for memory operations."""

    # ── Conversation operations ──────────────────────────────────

    async def get_or_create_conversation(
        self, user_id: str, conversation_id: Optional[str] = None
    ) -> dict:
        """Get an existing conversation or create a new one.

        If conversation_id is provided and valid, returns that conversation.
        Otherwise creates a new one.
        """
        if conversation_id:
            conv = await store.get_conversation(conversation_id, user_id)
            if conv:
                return conv
            logger.warning(
                "Conversation %s not found for user %s, creating new",
                conversation_id,
                user_id,
            )

        return await store.create_conversation(user_id)

    async def get_conversation_context(
        self, user_id: str, conversation_id: str
    ) -> list[dict]:
        """Get bounded conversation history for LLM context."""
        return await store.get_messages(
            conversation_id,
            user_id,
            limit=MAX_CONTEXT_MESSAGES,
            max_chars=MAX_CONTEXT_CHARS,
        )

    async def save_user_message(
        self, conversation_id: str, content: str
    ) -> dict:
        """Persist a user message."""
        return await store.add_message(conversation_id, "user", content)

    async def save_assistant_message(
        self, conversation_id: str, content: str
    ) -> dict:
        """Persist an assistant message."""
        return await store.add_message(conversation_id, "assistant", content)

    async def list_conversations(self, user_id: str) -> list[dict]:
        """List all conversations for a user."""
        return await store.list_conversations(user_id)

    async def get_conversation(self, user_id: str, conversation_id: str) -> Optional[dict]:
        """Get a single conversation with message count."""
        conv = await store.get_conversation(conversation_id, user_id)
        if not conv:
            return None
        # Could add message count here if needed
        return conv

    # ── Preference operations ────────────────────────────────────

    async def get_preferences(self, user_id: str) -> dict[str, str]:
        """Get all stored preferences for a user."""
        return await store.get_preferences(user_id)

    async def set_preference(self, user_id: str, key: str, value: str) -> dict:
        """Set a preference, validating the key."""
        if key not in VALID_PREFERENCE_KEYS:
            raise ValueError(
                f"Invalid preference key: {key}. "
                f"Valid keys: {sorted(VALID_PREFERENCE_KEYS)}"
            )
        return await store.set_preference(user_id, key, value)

    async def delete_preference(self, user_id: str, key: str) -> bool:
        """Delete a single preference."""
        return await store.delete_preference(user_id, key)

    async def clear_preferences(self, user_id: str) -> int:
        """Clear all preferences for a user."""
        return await store.clear_preferences(user_id)

    def merge_preferences(
        self, stored: dict[str, str], explicit: Optional[dict] = None
    ) -> dict:
        """Merge stored preferences with explicit request preferences.

        Explicit preferences take precedence over stored ones.
        Only recommendation-relevant fields are merged.

        Returns a dict compatible with AI-5 UserPreferences.
        """
        merged = {}

        # Map stored preference keys to UserPreferences fields
        key_mapping = {
            "preferred_origin": "origin",
            "preferred_destination": "destination",
            "prefers_direct": "direct_only",
            "preferred_airline": "airline_preference",
            "budget_preference": "budget",
            "preferred_departure_time": "travel_time",
            "preferred_arrival_time": "arrival_time",
        }

        # Apply stored preferences
        for stored_key, pref_key in key_mapping.items():
            if stored_key in stored:
                value = stored[stored_key]
                if pref_key == "direct_only":
                    merged[pref_key] = value.lower() in ("true", "1", "yes")
                elif pref_key == "budget":
                    try:
                        merged[pref_key] = float(value)
                    except (ValueError, TypeError):
                        pass
                else:
                    merged[pref_key] = value

        # Apply explicit preferences (override stored)
        if explicit:
            for key in ("origin", "destination", "travel_date", "travel_time",
                        "budget", "budget_currency", "direct_only",
                        "airline_preference", "other_preferences"):
                if key in explicit and explicit[key] is not None:
                    merged[key] = explicit[key]

        return merged


# Module-level singleton
memory_service = MemoryService()
