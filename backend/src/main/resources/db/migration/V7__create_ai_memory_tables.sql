-- V7__create_ai_memory_tables.sql
-- AI-6: Conversation and Preference Memory
-- Creates tables for conversation history and user preference storage.

-- Conversations: groups of related messages between a user and the AI
CREATE TABLE IF NOT EXISTS ai_conversation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(100) NOT NULL,
    title VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversation_user_id ON ai_conversation(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversation_updated_at ON ai_conversation(updated_at);

-- Messages: individual messages within a conversation
CREATE TABLE IF NOT EXISTS ai_message (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES ai_conversation(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_message_conversation_id ON ai_message(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_message_created_at ON ai_message(created_at);

-- User AI Preferences: durable, structured preferences per user
CREATE TABLE IF NOT EXISTS ai_user_preference (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(100) NOT NULL,
    preference_key VARCHAR(100) NOT NULL,
    preference_value VARCHAR(500) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, preference_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_user_preference_user_id ON ai_user_preference(user_id);
