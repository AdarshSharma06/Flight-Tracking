"""RAG data models."""

from dataclasses import dataclass, field
from typing import Optional
from uuid import UUID, uuid4


@dataclass
class RagDocument:
    """A RAG document in the knowledge base."""
    id: UUID = field(default_factory=uuid4)
    title: str = ""
    source: Optional[str] = None
    document_type: str = "manual"
    language: str = "en"
    checksum: Optional[str] = None
    metadata: dict = field(default_factory=dict)


@dataclass
class RagChunk:
    """A text chunk with embedding vector."""
    id: UUID = field(default_factory=uuid4)
    document_id: UUID = field(default_factory=uuid4)
    chunk_index: int = 0
    content: str = ""
    metadata: dict = field(default_factory=dict)
    embedding: Optional[list[float]] = None
    created_at: Optional[str] = None


@dataclass
class RetrievalResult:
    """A retrieval result with similarity score."""
    chunk: RagChunk
    score: float
    document_title: str = ""
    document_type: str = ""
