"""Persistent memory store for AI conversations and user preferences.

Uses asyncpg to store conversation history and structured preferences
in PostgreSQL. Shares the same DATABASE_URL as RAG but uses a separate pool.
"""

import logging
from typing import Optional
from uuid import UUID, uuid4

import asyncpg

from app.config import get_settings

logger = logging.getLogger(__name__)

_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    """Get or create the asyncpg connection pool for memory."""
    global _pool
    if _pool is None:
        settings = get_settings()
        dsn = settings.database_url
        if not dsn:
            raise RuntimeError("DATABASE_URL not configured — cannot access memory store")
        _pool = await asyncpg.create_pool(dsn=dsn, min_size=1, max_size=5)
        logger.info("Memory database pool created")
    return _pool


async def close_pool():
    """Close the connection pool."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        logger.info("Memory database pool closed")


# ── Conversation operations ──────────────────────────────────────────


async def create_conversation(user_id: str, title: Optional[str] = None) -> dict:
    """Create a new conversation for a user."""
    pool = await get_pool()
    conv_id = uuid4()
    await pool.execute(
        "INSERT INTO ai_conversation (id, user_id, title) VALUES ($1, $2, $3)",
        conv_id,
        user_id,
        title,
    )
    logger.info("Created conversation %s for user %s", conv_id, user_id)
    return {"id": str(conv_id), "user_id": user_id, "title": title}


async def get_conversation(conversation_id: str, user_id: str) -> Optional[dict]:
    """Retrieve a conversation, ensuring it belongs to the user."""
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT id, user_id, title, created_at, updated_at "
        "FROM ai_conversation WHERE id = $1 AND user_id = $2",
        UUID(conversation_id),
        user_id,
    )
    if not row:
        return None
    return {
        "id": str(row["id"]),
        "user_id": row["user_id"],
        "title": row["title"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


async def list_conversations(user_id: str, limit: int = 50) -> list[dict]:
    """List conversations for a user, most recent first."""
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT id, user_id, title, created_at, updated_at "
        "FROM ai_conversation WHERE user_id = $1 "
        "ORDER BY updated_at DESC LIMIT $2",
        user_id,
        limit,
    )
    return [
        {
            "id": str(r["id"]),
            "user_id": r["user_id"],
            "title": r["title"],
            "created_at": r["created_at"],
            "updated_at": r["updated_at"],
        }
        for r in rows
    ]


async def update_conversation_title(conversation_id: str, user_id: str, title: str) -> bool:
    """Update a conversation title. Returns True if updated."""
    pool = await get_pool()
    result = await pool.execute(
        "UPDATE ai_conversation SET title = $1, updated_at = now() "
        "WHERE id = $2 AND user_id = $3",
        title,
        UUID(conversation_id),
        user_id,
    )
    return result.endswith("1")


async def touch_conversation(conversation_id: str) -> None:
    """Update the updated_at timestamp of a conversation."""
    pool = await get_pool()
    await pool.execute(
        "UPDATE ai_conversation SET updated_at = now() WHERE id = $1",
        UUID(conversation_id),
    )


# ── Message operations ───────────────────────────────────────────────


async def add_message(conversation_id: str, role: str, content: str) -> dict:
    """Add a message to a conversation."""
    pool = await get_pool()
    msg_id = uuid4()
    await pool.execute(
        "INSERT INTO ai_message (id, conversation_id, role, content) VALUES ($1, $2, $3, $4)",
        msg_id,
        UUID(conversation_id),
        role,
        content,
    )
    await touch_conversation(conversation_id)
    return {"id": str(msg_id), "conversation_id": conversation_id, "role": role, "content": content}


async def get_messages(
    conversation_id: str,
    user_id: str,
    limit: int = 20,
    max_chars: int = 8000,
) -> list[dict]:
    """Retrieve bounded conversation context for a conversation.

    Returns at most `limit` most recent messages, with total content
    capped at `max_chars` (oldest messages trimmed first).
    """
    pool = await get_pool()

    # Verify conversation belongs to user
    conv = await pool.fetchrow(
        "SELECT id FROM ai_conversation WHERE id = $1 AND user_id = $2",
        UUID(conversation_id),
        user_id,
    )
    if not conv:
        return []

    # Get recent messages (newest first, then reverse)
    rows = await pool.fetch(
        "SELECT id, role, content, created_at "
        "FROM ai_message WHERE conversation_id = $1 "
        "ORDER BY created_at DESC LIMIT $2",
        UUID(conversation_id),
        limit,
    )

    messages = [
        {
            "id": str(r["id"]),
            "role": r["role"],
            "content": r["content"],
            "created_at": r["created_at"],
        }
        for r in reversed(rows)
    ]

    # Apply character budget: trim oldest messages first
    total_chars = sum(len(m["content"]) for m in messages)
    while total_chars > max_chars and len(messages) > 1:
        removed = messages.pop(0)
        total_chars -= len(removed["content"])

    return messages


# ── Preference operations ────────────────────────────────────────────


async def set_preference(user_id: str, key: str, value: str) -> dict:
    """Set or update a user preference."""
    pool = await get_pool()
    await pool.execute(
        "INSERT INTO ai_user_preference (id, user_id, preference_key, preference_value) "
        "VALUES ($1, $2, $3, $4) "
        "ON CONFLICT (user_id, preference_key) "
        "DO UPDATE SET preference_value = $4, updated_at = now()",
        uuid4(),
        user_id,
        key,
        value,
    )
    logger.info("Set preference %s=%s for user %s", key, value, user_id)
    return {"user_id": user_id, "key": key, "value": value}


async def get_preferences(user_id: str) -> dict[str, str]:
    """Get all preferences for a user as a dict."""
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT preference_key, preference_value "
        "FROM ai_user_preference WHERE user_id = $1",
        user_id,
    )
    return {r["preference_key"]: r["preference_value"] for r in rows}


async def delete_preference(user_id: str, key: str) -> bool:
    """Delete a user preference. Returns True if deleted."""
    pool = await get_pool()
    result = await pool.execute(
        "DELETE FROM ai_user_preference WHERE user_id = $1 AND preference_key = $2",
        user_id,
        key,
    )
    deleted = result.endswith("1")
    if deleted:
        logger.info("Deleted preference %s for user %s", key, user_id)
    return deleted


async def clear_preferences(user_id: str) -> int:
    """Clear all preferences for a user. Returns count deleted."""
    pool = await get_pool()
    result = await pool.execute(
        "DELETE FROM ai_user_preference WHERE user_id = $1",
        user_id,
    )
    count = int(result.split()[-1])
    logger.info("Cleared %d preferences for user %s", count, user_id)
    return count
