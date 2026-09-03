"""Text chunking for RAG ingestion."""

import re
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Default chunking parameters
DEFAULT_CHUNK_SIZE = 500  # characters
DEFAULT_CHUNK_OVERLAP = 100  # characters


def chunk_text(
    text: str,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    chunk_overlap: int = DEFAULT_CHUNK_OVERLAP,
) -> list[str]:
    """Split text into overlapping chunks suitable for embedding.

    Uses paragraph-aware splitting when possible, falling back to
    sentence-aware splitting, then character-level splitting.

    Args:
        text: The full document text.
        chunk_size: Maximum characters per chunk.
        chunk_overlap: Overlap between consecutive chunks.

    Returns:
        List of text chunks.
    """
    if not text or not text.strip():
        return []

    text = text.strip()

    # If text fits in one chunk, return as-is
    if len(text) <= chunk_size:
        return [text]

    # Try paragraph-aware splitting first
    chunks = _chunk_by_paragraphs(text, chunk_size, chunk_overlap)
    if chunks:
        return chunks

    # Fall back to sentence-aware splitting
    chunks = _chunk_by_sentences(text, chunk_size, chunk_overlap)
    if chunks:
        return chunks

    # Last resort: character-level splitting
    return _chunk_by_characters(text, chunk_size, chunk_overlap)


def _chunk_by_paragraphs(
    text: str, chunk_size: int, chunk_overlap: int
) -> list[str]:
    """Split text by paragraphs, merging small ones into chunks."""
    paragraphs = re.split(r"\n\s*\n", text)
    paragraphs = [p.strip() for p in paragraphs if p.strip()]

    if len(paragraphs) <= 1:
        return []

    chunks = []
    current = ""

    for para in paragraphs:
        if len(current) + len(para) + 2 <= chunk_size:
            current = f"{current}\n\n{para}" if current else para
        else:
            if current:
                chunks.append(current)
            # If a single paragraph exceeds chunk_size, split it further
            if len(para) > chunk_size:
                sub_chunks = _chunk_by_sentences(para, chunk_size, chunk_overlap)
                chunks.extend(sub_chunks)
                current = ""
            else:
                current = para

    if current:
        chunks.append(current)

    return _apply_overlap(chunks, chunk_overlap) if chunk_overlap > 0 else chunks


def _chunk_by_sentences(
    text: str, chunk_size: int, chunk_overlap: int
) -> list[str]:
    """Split text by sentences, merging into chunks."""
    # Split on sentence boundaries
    sentences = re.split(r"(?<=[.!?])\s+", text)
    sentences = [s.strip() for s in sentences if s.strip()]

    if len(sentences) <= 1:
        return []

    chunks = []
    current = ""

    for sentence in sentences:
        if len(current) + len(sentence) + 1 <= chunk_size:
            current = f"{current} {sentence}" if current else sentence
        else:
            if current:
                chunks.append(current)
            if len(sentence) > chunk_size:
                # Single sentence too long, force-split
                sub_chunks = _chunk_by_characters(sentence, chunk_size, chunk_overlap)
                chunks.extend(sub_chunks)
                current = ""
            else:
                current = sentence

    if current:
        chunks.append(current)

    return _apply_overlap(chunks, chunk_overlap) if chunk_overlap > 0 else chunks


def _chunk_by_characters(
    text: str, chunk_size: int, chunk_overlap: int
) -> list[str]:
    """Character-level splitting with overlap."""
    chunks = []
    start = 0

    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]
        if chunk.strip():
            chunks.append(chunk.strip())
        start += chunk_size - chunk_overlap

    return chunks


def _apply_overlap(chunks: list[str], overlap: int) -> list[str]:
    """Apply overlap between consecutive chunks by prepending tail of previous."""
    if len(chunks) <= 1 or overlap <= 0:
        return chunks

    result = [chunks[0]]
    for i in range(1, len(chunks)):
        prev = chunks[i - 1]
        tail = prev[-overlap:] if len(prev) > overlap else prev
        # Find a clean break point in the tail
        space_idx = tail.find(" ")
        if space_idx > 0:
            tail = tail[space_idx + 1:]
        overlapped = f"{tail} {chunks[i]}" if tail else chunks[i]
        result.append(overlapped)

    return result
