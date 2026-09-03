-- V6__enable_pgvector_create_rag_tables.sql
-- AI-2: RAG + Embeddings + pgvector
-- Enables pgvector extension and creates RAG document/chunk tables.

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- RAG Documents: stores ingested knowledge base documents
CREATE TABLE IF NOT EXISTS rag_document (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL,
    source VARCHAR(200),
    document_type VARCHAR(50) NOT NULL,
    language VARCHAR(10) DEFAULT 'en',
    checksum VARCHAR(64),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rag_document_type ON rag_document(document_type);
CREATE INDEX IF NOT EXISTS idx_rag_document_checksum ON rag_document(checksum);

-- RAG Chunks: stores text chunks with vector embeddings for similarity search
CREATE TABLE IF NOT EXISTS rag_chunk (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES rag_document(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    embedding VECTOR(384),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rag_chunk_document_id ON rag_chunk(document_id);
