"""Memory API endpoints — conversation and preference management."""

import logging
from typing import Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app.memory.service import memory_service, VALID_PREFERENCE_KEYS

logger = logging.getLogger(__name__)

router = APIRouter(tags=["memory"])


# ── Request/Response models ──────────────────────────────────────


class PreferenceRequest(BaseModel):
    key: str = Field(..., description="Preference key")
    value: str = Field(..., description="Preference value")


class PreferenceResponse(BaseModel):
    user_id: str
    key: str
    value: str


class PreferencesListResponse(BaseModel):
    preferences: dict[str, str]


class ConversationResponse(BaseModel):
    id: str
    user_id: str
    title: Optional[str] = None


class ConversationListResponse(BaseModel):
    conversations: list[ConversationResponse]


class ValidKeysResponse(BaseModel):
    keys: list[str]


# ── Conversation endpoints ───────────────────────────────────────


@router.get("/conversations", response_model=ConversationListResponse)
async def list_conversations(http_request: Request):
    """List all conversations for the authenticated user."""
    user_id = getattr(http_request.state, "user_id", None)
    if not user_id:
        return ConversationListResponse(conversations=[])
    conversations = await memory_service.list_conversations(user_id)
    return ConversationListResponse(
        conversations=[
            ConversationResponse(
                id=c["id"], user_id=c["user_id"], title=c["title"]
            )
            for c in conversations
        ]
    )


@router.get("/conversations/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(conversation_id: str, http_request: Request):
    """Get a specific conversation."""
    user_id = getattr(http_request.state, "user_id", None)
    if not user_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="User identity required")
    conv = await memory_service.get_conversation(user_id, conversation_id)
    if not conv:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Conversation not found")
    return ConversationResponse(
        id=conv["id"], user_id=conv["user_id"], title=conv["title"]
    )


# ── Preference endpoints ─────────────────────────────────────────


@router.get("/preferences", response_model=PreferencesListResponse)
async def get_preferences(http_request: Request):
    """Get all stored preferences for the authenticated user."""
    user_id = getattr(http_request.state, "user_id", None)
    if not user_id:
        return PreferencesListResponse(preferences={})
    prefs = await memory_service.get_preferences(user_id)
    return PreferencesListResponse(preferences=prefs)


@router.post("/preferences", response_model=PreferenceResponse)
async def set_preference(request: PreferenceRequest, http_request: Request):
    """Set or update a user preference."""
    user_id = getattr(http_request.state, "user_id", None)
    if not user_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="User identity required")
    try:
        result = await memory_service.set_preference(user_id, request.key, request.value)
        return PreferenceResponse(
            user_id=result["user_id"], key=result["key"], value=result["value"]
        )
    except ValueError as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/preferences/{key}")
async def delete_preference(key: str, http_request: Request):
    """Delete a specific user preference."""
    user_id = getattr(http_request.state, "user_id", None)
    if not user_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="User identity required")
    deleted = await memory_service.delete_preference(user_id, key)
    if not deleted:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Preference not found")
    return {"status": "deleted", "key": key}


@router.delete("/preferences")
async def clear_preferences(http_request: Request):
    """Clear all preferences for the authenticated user."""
    user_id = getattr(http_request.state, "user_id", None)
    if not user_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="User identity required")
    count = await memory_service.clear_preferences(user_id)
    return {"status": "cleared", "count": count}


@router.get("/preferences/valid-keys", response_model=ValidKeysResponse)
async def get_valid_keys():
    """Get the list of valid preference keys."""
    return ValidKeysResponse(keys=sorted(VALID_PREFERENCE_KEYS))
