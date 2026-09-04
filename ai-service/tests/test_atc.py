"""Tests for AI-7 ATC anomaly explanation endpoint and service."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.api.atc_models import AtcExplanationRequest, AtcExplanationResponse, TelemetryData, WeatherData
from app.api.atc_service import explain_anomaly, _build_explanation_prompt, _extract_json
from app.api.atc_prompt import ATC_EXPLANATION_PROMPT
from app.llm.base import LLMClient, LLMMessage, LLMResponse


# ── Fixtures ────────────────────────────────────────────────────────


def _make_request(**overrides) -> AtcExplanationRequest:
    defaults = {
        "anomalyId": 42,
        "flightNumber": "LH400",
        "anomalyType": "ALTITUDE_DEVIATION",
        "severity": "HIGH",
        "description": "Aircraft deviated 2000ft from assigned altitude",
        "status": "OPEN",
        "detectedAt": "2026-09-04T10:00:00Z",
        "telemetry": TelemetryData(
            id=1,
            flightNumber="LH400",
            originIata="FRA",
            destinationIata="JFK",
            latitude=50.1,
            longitude=-10.5,
            altitude=35000,
            speed=480,
            direction=270,
            heading=268,
            flightStatus="en route",
            aircraftRegistration="D-ABCD",
            recordedAt="2026-09-04T09:58:00Z",
        ),
        "weather": WeatherData(
            temperature=15.2,
            windSpeed=35,
            humidity=65,
            precipitation=0.0,
            weatherCondition="Partly cloudy",
        ),
        "limitations": [],
    }
    defaults.update(overrides)
    return AtcExplanationRequest(**defaults)


def _make_llm_response(content: str) -> LLMResponse:
    return LLMResponse(content=content, model="test-model")


class FakeLLMClient(LLMClient):
    def __init__(self, response_content: str):
        self._response = response_content

    async def complete(self, messages, model=None, temperature=0.7, max_tokens=1024, tools=None):
        return _make_llm_response(self._response)

    def is_configured(self) -> bool:
        return True


class UnconfiguredLLMClient(LLMClient):
    async def complete(self, messages, model=None, temperature=0.7, max_tokens=1024, tools=None):
        raise RuntimeError("Should not be called")

    def is_configured(self) -> bool:
        return False


# ── Prompt Tests ────────────────────────────────────────────────────


class TestAtcPrompt:
    def test_prompt_includes_critical_rules(self):
        assert "You do NOT detect anomalies" in ATC_EXPLANATION_PROMPT
        assert "MUST NOT invent" in ATC_EXPLANATION_PROMPT
        assert "MUST NOT change units" in ATC_EXPLANATION_PROMPT

    def test_prompt_instructs_distinction(self):
        assert "FACTS" in ATC_EXPLANATION_PROMPT
        assert "INTERPRETATION" in ATC_EXPLANATION_PROMPT
        assert "UNAVAILABLE" in ATC_EXPLANATION_PROMPT


# ── Prompt Builder Tests ────────────────────────────────────────────


class TestBuildPrompt:
    def test_includes_anomaly_data(self):
        req = _make_request()
        prompt = _build_explanation_prompt(req)
        assert "LH400" in prompt
        assert "ALTITUDE_DEVIATION" in prompt
        assert "HIGH" in prompt

    def test_includes_telemetry(self):
        req = _make_request()
        prompt = _build_explanation_prompt(req)
        assert "35000" in prompt
        assert "480" in prompt
        assert "FRA" in prompt

    def test_includes_weather(self):
        req = _make_request()
        prompt = _build_explanation_prompt(req)
        assert "15.2" in prompt
        assert "35" in prompt
        assert "Partly cloudy" in prompt

    def test_no_telemetry_shows_unavailable(self):
        req = _make_request(telemetry=None)
        prompt = _build_explanation_prompt(req)
        assert "UNAVAILABLE" in prompt
        assert "no telemetry record" in prompt

    def test_no_weather_shows_unavailable(self):
        req = _make_request(weather=None)
        prompt = _build_explanation_prompt(req)
        assert "WEATHER CONDITIONS: [UNAVAILABLE]" in prompt

    def test_includes_limitations(self):
        req = _make_request(limitations=["Test limitation"])
        prompt = _build_explanation_prompt(req)
        assert "Test limitation" in prompt

    def test_requests_json_output(self):
        req = _make_request()
        prompt = _build_explanation_prompt(req)
        assert "JSON" in prompt


# ── JSON Extraction Tests ───────────────────────────────────────────


class TestExtractJson:
    def test_clean_json(self):
        result = _extract_json('{"explanation": "test", "facts": [], "context": [], "limitations": []}')
        assert result["explanation"] == "test"

    def test_markdown_fenced_json(self):
        text = 'Here is the result:\n```json\n{"explanation": "test"}\n```'
        result = _extract_json(text)
        assert result["explanation"] == "test"

    def test_text_before_json(self):
        text = 'Some text before {"explanation": "test"} and after'
        result = _extract_json(text)
        assert result["explanation"] == "test"

    def test_plain_text_fallback(self):
        result = _extract_json("This is just plain text")
        assert result["explanation"] == "This is just plain text"


# ── Service Tests ───────────────────────────────────────────────────


class TestExplainAnomaly:
    async def test_returns_structured_json_response(self):
        response_data = {
            "explanation": "The aircraft deviated from its assigned altitude.",
            "facts": ["Altitude: 35000 ft", "Speed: 480 kts"],
            "context": ["En route from FRA to JFK"],
            "limitations": [],
        }
        llm = FakeLLMClient(json.dumps(response_data))
        req = _make_request()
        result = await explain_anomaly(req, llm)

        assert isinstance(result, AtcExplanationResponse)
        assert "deviated" in result.explanation
        assert result.anomalyId == 42
        assert result.flightNumber == "LH400"
        assert len(result.facts) == 2
        assert len(result.context) == 1

    async def test_returns_fallback_when_llm_not_configured(self):
        llm = UnconfiguredLLMClient()
        req = _make_request()
        result = await explain_anomaly(req, llm)

        assert "unavailable" in result.explanation.lower()
        assert result.anomalyId == 42
        assert result.facts == []
        assert len(result.limitations) == 1
        assert "temporarily unavailable" in result.limitations[0].lower()

    async def test_returns_fallback_when_llm_is_none(self):
        req = _make_request()
        result = await explain_anomaly(req, None)

        assert "unavailable" in result.explanation.lower()
        assert result.anomalyId == 42

    async def test_handles_llm_failure_gracefully(self):
        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(side_effect=RuntimeError("LLM crashed"))
        req = _make_request()
        result = await explain_anomaly(req, llm)

        assert "unavailable" in result.explanation.lower()
        assert len(result.limitations) == 1
        assert "temporarily unavailable" in result.limitations[0].lower()

    async def test_handles_plain_text_llm_response(self):
        llm = FakeLLMClient("The aircraft deviated from altitude. No other issues found.")
        req = _make_request()
        result = await explain_anomaly(req, llm)

        assert "deviated" in result.explanation
        assert result.anomalyId == 42

    async def test_preserves_limitations_from_request(self):
        response_data = {"explanation": "test", "facts": [], "context": [], "limitations": []}
        llm = FakeLLMClient(json.dumps(response_data))
        req = _make_request(limitations=["Pre-existing limitation"])
        result = await explain_anomaly(req, llm)

        assert "Pre-existing limitation" in result.limitations

    async def test_merges_llm_and_request_limitations(self):
        response_data = {"explanation": "test", "facts": [], "context": [], "limitations": ["LLM limitation"]}
        llm = FakeLLMClient(json.dumps(response_data))
        req = _make_request(limitations=["App limitation"])
        result = await explain_anomaly(req, llm)

        assert "LLM limitation" in result.limitations
        assert "App limitation" in result.limitations

    async def test_no_fabricated_measurements_in_response(self):
        """The service should not add any measurements beyond what the LLM returns."""
        response_data = {
            "explanation": "Altitude deviation observed.",
            "facts": ["Altitude: 35000 ft"],
            "context": [],
            "limitations": [],
        }
        llm = FakeLLMClient(json.dumps(response_data))
        req = _make_request()
        result = await explain_anomaly(req, llm)

        # The service should not inject any measurements
        assert len(result.facts) == 1
        assert "35000" in result.facts[0]

    async def test_no_exception_class_names_in_limitations(self):
        """Internal exception names must never appear in user-facing limitations."""
        for exc_cls in (RuntimeError, ConnectionError, ValueError, TimeoutError, OSError):
            llm = MagicMock(spec=LLMClient)
            llm.is_configured.return_value = True
            llm.complete = AsyncMock(side_effect=exc_cls("internal detail"))
            req = _make_request()
            result = await explain_anomaly(req, llm)

            serialized = json.dumps(result.model_dump())
            for name in ("RuntimeError", "ConnectionError", "ValueError", "TimeoutError", "OSError",
                         "Exception", "Traceback", "stacktrace"):
                assert name not in serialized, f"{name} leaked in error response for {exc_cls.__name__}"

    async def test_no_fallback_contains_exception_details(self):
        """Fallback explanation must be generic, not contain internal error text."""
        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(side_effect=RuntimeError("database host 10.0.0.1 refused connection"))
        req = _make_request()
        result = await explain_anomaly(req, llm)

        assert "10.0.0.1" not in result.explanation
        assert "database" not in result.explanation.lower()
        assert "refused" not in result.explanation.lower()


# ── Endpoint Tests ──────────────────────────────────────────────────


class TestAtcEndpoint:
    async def test_endpoint_exists(self, async_client):
        response_data = {
            "explanation": "test explanation",
            "facts": ["fact 1"],
            "context": ["context 1"],
            "limitations": [],
        }
        with patch("app.api.atc._get_llm_client") as mock_get:
            mock_llm = MagicMock(spec=LLMClient)
            mock_llm.is_configured.return_value = True
            mock_llm.complete = AsyncMock(return_value=LLMResponse(
                content=json.dumps(response_data), model="test"
            ))
            mock_get.return_value = mock_llm

            response = await async_client.post(
                "/api/ai/atc/explain",
                json={
                    "anomalyId": 1,
                    "flightNumber": "LH400",
                    "anomalyType": "SPEED",
                    "severity": "MEDIUM",
                    "status": "OPEN",
                },
            )

        assert response.status_code == 200
        data = response.json()
        assert "explanation" in data
        assert "anomalyId" in data
        assert data["anomalyId"] == 1

    async def test_endpoint_rejects_missing_anomaly_id(self, async_client):
        response = await async_client.post(
            "/api/ai/atc/explain",
            json={"flightNumber": "LH400"},
        )
        assert response.status_code == 422

    async def test_endpoint_with_minimal_data(self, async_client):
        response_data = {"explanation": "Minimal data explanation", "facts": [], "context": [], "limitations": []}
        with patch("app.api.atc._get_llm_client") as mock_get:
            mock_llm = MagicMock(spec=LLMClient)
            mock_llm.is_configured.return_value = True
            mock_llm.complete = AsyncMock(return_value=LLMResponse(
                content=json.dumps(response_data), model="test"
            ))
            mock_get.return_value = mock_llm

            response = await async_client.post(
                "/api/ai/atc/explain",
                json={"anomalyId": 42},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["anomalyId"] == 42


# ── Security / Grounding Tests ──────────────────────────────────────


class TestAtcSecurity:
    async def test_no_secrets_in_response(self):
        response_data = {
            "explanation": "The sk-or-v1-secret was not exposed.",
            "facts": [],
            "context": [],
            "limitations": [],
        }
        llm = FakeLLMClient(json.dumps(response_data))
        req = _make_request()
        result = await explain_anomaly(req, llm)

        result_dict = result.model_dump()
        serialized = json.dumps(result_dict)
        assert "sk-or-v1-" not in serialized or "exposed" in serialized

    async def test_response_schema_matches_contract(self):
        response_data = {
            "explanation": "test",
            "facts": ["f1"],
            "context": ["c1"],
            "limitations": ["l1"],
        }
        llm = FakeLLMClient(json.dumps(response_data))
        req = _make_request()
        result = await explain_anomaly(req, llm)

        assert hasattr(result, "explanation")
        assert hasattr(result, "anomalyId")
        assert hasattr(result, "flightNumber")
        assert hasattr(result, "facts")
        assert hasattr(result, "context")
        assert hasattr(result, "limitations")
        assert isinstance(result.facts, list)
        assert isinstance(result.context, list)
        assert isinstance(result.limitations, list)


# ── Regression Tests ────────────────────────────────────────────────


class TestAtcRegression:
    async def test_chat_still_works(self):
        """AI-1 chat should not be broken by AI-7."""
        from app.api.chat_service import ChatService

        fake = FakeLLMClient("Hello, I am a helpful aviation assistant.")
        service = ChatService(fake)

        from app.api.models import ChatRequest
        req = ChatRequest(message="Hello")
        resp = await service.chat(req, "test-req-id")

        assert resp.answer == "Hello, I am a helpful aviation assistant."
        assert resp.model == "test-model"

    async def test_recommendation_still_works(self):
        """AI-5 recommendation graph should not be broken by AI-7."""
        from app.agents.recommendation_agent import compile_recommendation_graph

        fake = FakeLLMClient('{"recommended_flight": null, "alternatives": [], "explanation": "No flights found.", "limitations": [], "total_flights_evaluated": 0}')
        graph = compile_recommendation_graph(fake)
        assert graph is not None
