"""Tests for AI-2: RAG, chunking, embedding, retrieval, ingestion."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from uuid import uuid4

from app.rag.chunking import chunk_text, _chunk_by_characters
from app.rag.models import RagDocument, RagChunk, RetrievalResult
from app.rag.retriever import format_retrieval_context, should_use_rag


# ============================================================
# Chunking Tests
# ============================================================

class TestChunking:
    def test_empty_text(self):
        assert chunk_text("") == []
        assert chunk_text("   ") == []

    def test_short_text_single_chunk(self):
        text = "This is a short text."
        chunks = chunk_text(text, chunk_size=500)
        assert len(chunks) == 1
        assert chunks[0] == text

    def test_long_text_multiple_chunks(self):
        text = "Word " * 200  # ~1000 chars
        chunks = chunk_text(text, chunk_size=300, chunk_overlap=50)
        assert len(chunks) > 1
        # All chunks should be non-empty
        for chunk in chunks:
            assert len(chunk) > 0

    def test_paragraph_aware_chunking(self):
        text = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph."
        chunks = chunk_text(text, chunk_size=50, chunk_overlap=0)
        assert len(chunks) >= 2
        # Check all paragraphs appear somewhere
        combined = " ".join(chunks)
        assert "First paragraph" in combined
        assert "Second paragraph" in combined

    def test_sentence_aware_chunking(self):
        text = "Sentence one. Sentence two. Sentence three. Sentence four."
        chunks = chunk_text(text, chunk_size=40, chunk_overlap=0)
        assert len(chunks) >= 2

    def test_character_level_fallback(self):
        # A single very long word forces character-level splitting
        text = "A" * 500
        chunks = chunk_text(text, chunk_size=100, chunk_overlap=0)
        assert len(chunks) >= 5

    def test_chunk_overlap(self):
        text = "A" * 200
        chunks = chunk_text(text, chunk_size=100, chunk_overlap=20)
        assert len(chunks) >= 2
        # With overlap, chunks should have some shared content
        if len(chunks) >= 2:
            # Second chunk should start with content from the end of first
            assert len(chunks[1]) > 0

    def test_no_overlap(self):
        text = "First sentence. Second sentence. Third sentence."
        chunks = chunk_text(text, chunk_size=30, chunk_overlap=0)
        # No overlap means chunks are independent
        for chunk in chunks:
            assert len(chunk) > 0

    def test_very_long_paragraph(self):
        text = "This is a sentence. " * 100  # One long paragraph
        chunks = chunk_text(text, chunk_size=200, chunk_overlap=50)
        assert len(chunks) > 1


# ============================================================
# RAG Models Tests
# ============================================================

class TestRagModels:
    def test_rag_document_creation(self):
        doc = RagDocument(title="Test Doc", document_type="manual")
        assert doc.title == "Test Doc"
        assert doc.document_type == "manual"
        assert doc.id is not None

    def test_rag_chunk_creation(self):
        doc_id = uuid4()
        chunk = RagChunk(
            document_id=doc_id,
            chunk_index=0,
            content="Test content",
            embedding=[0.1] * 384,
        )
        assert chunk.document_id == doc_id
        assert chunk.chunk_index == 0
        assert len(chunk.embedding) == 384

    def test_retrieval_result(self):
        chunk = RagChunk(content="Test", chunk_index=0)
        result = RetrievalResult(
            chunk=chunk,
            score=0.85,
            document_title="Test",
            document_type="manual",
        )
        assert result.score == 0.85
        assert result.document_title == "Test"


# ============================================================
# Retriever Logic Tests
# ============================================================

class TestShouldUseRag:
    def test_aviation_knowledge_queries(self):
        assert should_use_rag("What is an airport?")
        assert should_use_rag("Explain ILS approach")
        assert should_use_rag("How does VOR navigation work?")
        assert should_use_rag("What are squawk codes?")
        assert should_use_rag("Describe ATC procedures")
        assert should_use_rag("What is turbulence?")
        assert should_use_rag("Explain flight levels")
        assert should_use_rag("What is a runway?")
        assert should_use_rag("What is METAR?")
        assert should_use_rag("Tell me about airspace classes")

    def test_live_data_queries_no_rag(self):
        assert not should_use_rag("Where is flight AI302?")
        assert not should_use_rag("Is my flight delayed?")
        assert not should_use_rag("Book a flight to Delhi")
        assert not should_use_rag("What's the weather at DEL right now?")
        assert not should_use_rag("Track flight 6E6892")

    def test_general_queries_no_rag(self):
        assert not should_use_rag("Hello")
        assert not should_use_rag("How are you?")
        assert not should_use_rag("Tell me a joke")


class TestFormatRetrievalContext:
    def test_empty_results(self):
        assert format_retrieval_context([]) == ""

    def test_single_result(self):
        chunk = RagChunk(content="An airport is a facility for aircraft.", chunk_index=0)
        result = RetrievalResult(
            chunk=chunk,
            score=0.92,
            document_title="Airport Basics",
            document_type="airport_operations",
        )
        context = format_retrieval_context([result])
        assert "Airport Basics" in context
        assert "airport_operations" in context
        assert "92%" in context
        assert "An airport is a facility" in context

    def test_multiple_results(self):
        results = []
        for i in range(3):
            chunk = RagChunk(content=f"Chunk {i} content", chunk_index=i)
            results.append(
                RetrievalResult(
                    chunk=chunk,
                    score=0.9 - i * 0.1,
                    document_title=f"Doc {i}",
                    document_type="manual",
                )
            )
        context = format_retrieval_context(results)
        assert "[1]" in context
        assert "[2]" in context
        assert "[3]" in context
        assert "Doc 0" in context
        assert "Doc 2" in context


# ============================================================
# Embedding Tests
# ============================================================

class TestEmbedding:
    def test_embed_texts(self):
        from app.rag.embedding import embed_texts
        texts = ["Hello world", "Test sentence"]
        embeddings = embed_texts(texts)
        assert len(embeddings) == 2
        assert len(embeddings[0]) == 384
        assert len(embeddings[1]) == 384

    def test_embed_query(self):
        from app.rag.embedding import embed_query
        embedding = embed_query("What is an airport?")
        assert len(embedding) == 384

    def test_embed_empty_list(self):
        from app.rag.embedding import embed_texts
        assert embed_texts([]) == []

    def test_embedding_dimension(self):
        from app.rag.embedding import get_embedding_dimension
        assert get_embedding_dimension() == 384

    def test_embeddings_are_normalized(self):
        from app.rag.embedding import embed_query
        import math
        emb = embed_query("test")
        norm = math.sqrt(sum(x * x for x in emb))
        # Normalized vectors should have norm close to 1.0
        assert abs(norm - 1.0) < 0.01

    def test_similar_texts_have_higher_similarity(self):
        from app.rag.embedding import embed_texts
        texts = [
            "What is an airport?",
            "Airport definition and description",
            "How to cook pasta",
        ]
        embeddings = embed_texts(texts)

        # Compute cosine similarity
        def cosine_sim(a, b):
            dot = sum(x * y for x, y in zip(a, b))
            norm_a = math.sqrt(sum(x * x for x in a))
            norm_b = math.sqrt(sum(x * x for x in b))
            return dot / (norm_a * norm_b) if norm_a * norm_b > 0 else 0

        import math
        sim_airport = cosine_sim(embeddings[0], embeddings[1])
        sim_pasta = cosine_sim(embeddings[0], embeddings[2])

        # Aviation queries should be more similar to each other than to cooking
        assert sim_airport > sim_pasta


# ============================================================
# ChatService with RAG Tests
# ============================================================

class TestChatServiceRAG:
    @pytest.mark.asyncio
    async def test_chat_service_aviation_question_uses_rag(self):
        """Aviation questions should attempt RAG retrieval."""
        from app.api.chat_service import ChatService
        from app.api.models import ChatRequest
        from app.llm.base import LLMClient, LLMResponse

        class MockLLM(LLMClient):
            async def complete(self, messages, model=None, temperature=0.7, max_tokens=1024):
                # Verify RAG context was included in system prompt
                system_msg = messages[0].content
                self.last_system = system_msg
                return LLMResponse(content="An airport is a facility.", model="test", usage={})
            def is_configured(self):
                return True

        llm = MockLLM()
        service = ChatService(llm)

        # Mock RAG retrieval to return context
        mock_results = [
            RetrievalResult(
                chunk=RagChunk(content="An airport is a designated area for aircraft.", chunk_index=0),
                score=0.85,
                document_title="Airport Basics",
                document_type="airport_operations",
            )
        ]

        with patch("app.rag.retriever.should_use_rag", return_value=True), \
             patch("app.rag.retriever.retrieve", new_callable=AsyncMock, return_value=mock_results), \
             patch("app.rag.retriever.format_retrieval_context", return_value="Airport Basics context"):
            req = ChatRequest(message="What is an airport?")
            resp = await service.chat(req, "req-test")

            assert resp.answer == "An airport is a facility."
            # Verify RAG context was in the system prompt
            assert "RETRIEVED AVIATION KNOWLEDGE" in llm.last_system

    @pytest.mark.asyncio
    async def test_chat_service_non_aviation_no_rag(self):
        """Non-aviation questions should not use RAG."""
        from app.api.chat_service import ChatService
        from app.api.models import ChatRequest
        from app.llm.base import LLMClient, LLMResponse

        class MockLLM(LLMClient):
            async def complete(self, messages, model=None, temperature=0.7, max_tokens=1024):
                self.last_system = messages[0].content
                return LLMResponse(content="Hello!", model="test", usage={})
            def is_configured(self):
                return True

        llm = MockLLM()
        service = ChatService(llm)

        with patch("app.rag.retriever.should_use_rag", return_value=False):
            req = ChatRequest(message="Hello, how are you?")
            resp = await service.chat(req, "req-test")

            assert resp.answer == "Hello!"
            # System prompt should NOT have RAG context
            assert "RETRIEVED AVIATION KNOWLEDGE" not in llm.last_system

    @pytest.mark.asyncio
    async def test_chat_service_rag_failure_graceful_fallback(self):
        """RAG failure should not break the chat."""
        from app.api.chat_service import ChatService
        from app.api.models import ChatRequest
        from app.llm.base import LLMClient, LLMResponse

        class MockLLM(LLMClient):
            async def complete(self, messages, model=None, temperature=0.7, max_tokens=1024):
                return LLMResponse(content="General answer.", model="test", usage={})
            def is_configured(self):
                return True

        llm = MockLLM()
        service = ChatService(llm)

        with patch("app.rag.retriever.should_use_rag", return_value=True), \
             patch("app.rag.retriever.retrieve", new_callable=AsyncMock, side_effect=Exception("DB down")):
            req = ChatRequest(message="What is an ILS?")
            resp = await service.chat(req, "req-test")

            # Should still get a response
            assert resp.answer == "General answer."
            assert resp.model == "test"

    @pytest.mark.asyncio
    async def test_chat_service_no_secrets_in_rag_response(self):
        """RAG context should not leak secrets."""
        from app.api.chat_service import ChatService
        from app.api.models import ChatRequest
        from app.llm.base import LLMClient, LLMResponse

        class MockLLM(LLMClient):
            async def complete(self, messages, model=None, temperature=0.7, max_tokens=1024):
                return LLMResponse(content="Answer.", model="test", usage={})
            def is_configured(self):
                return True

        llm = MockLLM()
        service = ChatService(llm)

        mock_results = [
            RetrievalResult(
                chunk=RagChunk(content="Some aviation content.", chunk_index=0),
                score=0.8,
                document_title="Test",
                document_type="manual",
            )
        ]

        with patch("app.rag.retriever.should_use_rag", return_value=True), \
             patch("app.rag.retriever.retrieve", new_callable=AsyncMock, return_value=mock_results), \
             patch("app.rag.retriever.format_retrieval_context", return_value="Context"):
            req = ChatRequest(message="What is an airport?")
            resp = await service.chat(req, "req-test")

            resp_dict = resp.model_dump()
            assert "api_key" not in resp_dict
            assert "apiKey" not in resp_dict
            assert "secret" not in resp_dict
            assert "sk-" not in resp.answer


# ============================================================
# Store Tests (mocked DB)
# ============================================================

class TestStore:
    def test_compute_checksum(self):
        from app.rag.store import compute_checksum
        checksum1 = compute_checksum("Hello world")
        checksum2 = compute_checksum("Hello world")
        checksum3 = compute_checksum("Different text")
        assert checksum1 == checksum2
        assert checksum1 != checksum3
        assert len(checksum1) == 64  # SHA-256 hex digest


# ============================================================
# RAG Endpoint Tests
# ============================================================

class TestRagEndpoints:
    @pytest.mark.asyncio
    async def test_rag_stats_endpoint_no_db(self):
        """Stats endpoint should handle missing DB gracefully."""
        from httpx import AsyncClient, ASGITransport
        from app.main import app

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/ai/rag/stats")
            # Should return 200 with zero stats if DB unavailable
            assert response.status_code == 200
            data = response.json()
            assert "documents" in data
            assert "chunks" in data

    @pytest.mark.asyncio
    async def test_ingest_document_endpoint_validation(self):
        """Ingest endpoint should validate input."""
        from httpx import AsyncClient, ASGITransport
        from app.main import app

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Empty title should fail
            response = await client.post("/api/ai/rag/ingest", json={
                "title": "",
                "content": "Some content",
            })
            assert response.status_code == 422

            # Empty content should fail
            response = await client.post("/api/ai/rag/ingest", json={
                "title": "Test",
                "content": "",
            })
            assert response.status_code == 422

            # Missing fields should fail
            response = await client.post("/api/ai/rag/ingest", json={})
            assert response.status_code == 422


# ============================================================
# Knowledge Base Tests
# ============================================================

class TestKnowledgeBase:
    def test_knowledge_files_exist(self):
        """Verify aviation knowledge files are present."""
        from pathlib import Path
        kb_dir = Path(__file__).parent.parent / "knowledge"
        assert kb_dir.exists(), "Knowledge directory should exist"

        files = list(kb_dir.glob("*.txt"))
        assert len(files) >= 5, f"Expected at least 5 knowledge files, found {len(files)}"

        expected_files = [
            "airport_basics.txt",
            "ils.txt",
            "vor_navigation.txt",
            "squawk_codes.txt",
            "atc_basics.txt",
            "aviation_weather.txt",
            "aircraft_basics.txt",
            "flight_phases.txt",
        ]
        found_names = {f.name for f in files}
        for expected in expected_files:
            assert expected in found_names, f"Missing knowledge file: {expected}"

    def test_knowledge_files_non_empty(self):
        """All knowledge files should have content."""
        from pathlib import Path
        kb_dir = Path(__file__).parent.parent / "knowledge"
        for f in kb_dir.glob("*.txt"):
            content = f.read_text(encoding="utf-8")
            assert len(content) > 100, f"{f.name} is too short ({len(content)} chars)"
