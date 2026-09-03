"""Embedding service using fastembed (lightweight ONNX-based, free)."""

import logging
from typing import Optional

logger = logging.getLogger(__name__)

_model = None
_model_name = "BAAI/bge-small-en-v1.5"
_embedding_dim = 384


def get_embedding_dimension() -> int:
    """Return the embedding dimensionality."""
    return _embedding_dim


def _get_model():
    """Lazy-load the fastembed model."""
    global _model
    if _model is None:
        try:
            from fastembed import TextEmbedding
            logger.info("Loading embedding model: %s", _model_name)
            _model = TextEmbedding(_model_name)
            logger.info("Embedding model loaded (dim=%d)", _embedding_dim)
        except ImportError:
            logger.error(
                "fastembed not installed. "
                "Install with: pip install fastembed"
            )
            raise
    return _model


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a list of texts and return their vector representations.

    Args:
        texts: List of strings to embed.

    Returns:
        List of 384-dimensional float vectors.

    Raises:
        RuntimeError: If embedding model is unavailable.
    """
    if not texts:
        return []

    model = _get_model()
    embeddings = list(model.embed(texts))
    return [emb.tolist() for emb in embeddings]


def embed_query(text: str) -> list[float]:
    """Embed a single query text.

    Args:
        text: The query string to embed.

    Returns:
        A 384-dimensional float vector.
    """
    return embed_texts([text])[0]


def is_available() -> bool:
    """Check if the embedding model can be loaded."""
    try:
        from fastembed import TextEmbedding  # noqa: F401
        return True
    except ImportError:
        return False
