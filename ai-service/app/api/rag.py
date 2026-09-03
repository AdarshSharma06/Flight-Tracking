"""RAG ingestion management endpoint."""

import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(tags=["rag"])

KNOWLEDGE_DIR = Path(__file__).parent.parent.parent / "knowledge"


class IngestRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    content: str = Field(..., min_length=1, max_length=100000)
    document_type: str = Field(default="manual", max_length=50)
    source: Optional[str] = Field(default=None, max_length=200)


class IngestResponse(BaseModel):
    status: str
    document_id: Optional[str] = None
    title: str
    chunks: int
    error: Optional[str] = None


class IngestKnowledgeBaseResponse(BaseModel):
    status: str
    documents_ingested: int
    results: list[dict]


class StatsResponse(BaseModel):
    documents: int
    chunks: int


@router.post("/rag/ingest", response_model=IngestResponse)
async def ingest_document(request: IngestRequest):
    """Ingest a single document into the RAG knowledge base."""
    try:
        from app.rag.ingestion import ingest_text
        result = await ingest_text(
            title=request.title,
            content=request.content,
            document_type=request.document_type,
            source=request.source,
        )
        return IngestResponse(**result)
    except Exception as e:
        logger.exception("Ingestion failed")
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")


@router.post("/rag/ingest-knowledge-base", response_model=IngestKnowledgeBaseResponse)
async def ingest_knowledge_base():
    """Ingest all documents from the knowledge directory.

    This is a deterministic ingestion: documents with the same checksum
    are not re-ingested.
    """
    try:
        from app.rag.ingestion import ingest_file

        if not KNOWLEDGE_DIR.exists():
            return IngestKnowledgeBaseResponse(
                status="error",
                documents_ingested=0,
                results=[{"error": f"Knowledge directory not found: {KNOWLEDGE_DIR}"}],
            )

        results = []
        count = 0

        for file_path in sorted(KNOWLEDGE_DIR.glob("*.txt")):
            if file_path.is_file():
                # Derive document type from filename
                doc_type = _infer_document_type(file_path.stem)
                result = await ingest_file(
                    str(file_path),
                    document_type=doc_type,
                )
                results.append(result)
                if result.get("status") == "success":
                    count += 1

        return IngestKnowledgeBaseResponse(
            status="success",
            documents_ingested=count,
            results=results,
        )
    except Exception as e:
        logger.exception("Knowledge base ingestion failed")
        raise HTTPException(
            status_code=500,
            detail=f"Knowledge base ingestion failed: {str(e)}",
        )


@router.get("/rag/stats", response_model=StatsResponse)
async def get_rag_stats():
    """Get statistics about the RAG knowledge base."""
    try:
        from app.rag.ingestion import get_knowledge_base_stats
        stats = await get_knowledge_base_stats()
        return StatsResponse(**stats)
    except Exception as e:
        logger.warning("Could not retrieve RAG stats: %s", e)
        return StatsResponse(documents=0, chunks=0)


def _infer_document_type(filename: str) -> str:
    """Infer document type from filename."""
    filename_lower = filename.lower()
    if "airport" in filename_lower:
        return "airport_operations"
    elif "ils" in filename_lower or "vor" in filename_lower:
        return "navigation"
    elif "squawk" in filename_lower or "transponder" in filename_lower:
        return "equipment"
    elif "atc" in filename_lower:
        return "atc_procedure"
    elif "weather" in filename_lower:
        return "weather"
    elif "aircraft" in filename_lower:
        return "aircraft"
    elif "flight" in filename_lower:
        return "flight_operations"
    else:
        return "manual"
