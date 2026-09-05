"""Tests for AI-5: LangGraph Flight Recommendation Agent."""

import dataclasses
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.agents.state import (
    FlightCandidate,
    PredictionInfo,
    RecommendationResult,
    RecommendationState,
    ScoredFlight,
    UserPreferences,
    WeatherInfo,
)
from app.agents.ranking import (
    _score_airline_match,
    _score_departure_convenience,
    _score_direct_preference,
    _score_weather_impact,
    rank_flights,
    score_flight,
)
from app.agents.nodes import (
    _extract_json_from_llm,
    enrich_flights,
    generate_recommendation,
    get_predictions,
    get_weather,
    parse_preferences,
    rank_flights_node,
    score_flights,
    search_flights,
)
from app.llm.base import LLMClient, LLMMessage, LLMResponse
from app.tools.base import ToolResult


# ===== State Model Tests =====


class TestStateModels:
    def test_user_preferences_defaults(self):
        prefs = UserPreferences()
        assert prefs.origin is None
        assert prefs.destination is None
        assert prefs.direct_only is False
        assert prefs.budget is None

    def test_flight_candidate_creation(self):
        c = FlightCandidate(
            flight_number="AI302",
            origin="DEL",
            destination="BOM",
            departure_time="2025-01-15T10:00",
        )
        assert c.flight_number == "AI302"
        assert c.origin == "DEL"

    def test_weather_info_creation(self):
        w = WeatherInfo(airport_iata="DEL", temperature=25.0, condition="Clear", available=True)
        assert w.available is True
        assert w.temperature == 25.0

    def test_prediction_info_unavailable(self):
        p = PredictionInfo(flight_number="AI302", available=False)
        assert p.available is False
        assert p.delay_probability is None

    def test_scored_flight_creation(self):
        c = FlightCandidate(flight_number="AI302")
        sf = ScoredFlight(candidate=c, score=0.85)
        assert sf.score == 0.85
        assert sf.candidate.flight_number == "AI302"

    def test_recommendation_result_defaults(self):
        r = RecommendationResult()
        assert r.recommended_flight is None
        assert r.alternatives == []
        assert r.total_flights_evaluated == 0

    def test_recommendation_state_defaults(self):
        s = RecommendationState()
        assert s.user_request == ""
        assert s.candidate_flights == []
        assert s.errors == []


# ===== Scoring Tests =====


class TestScoring:
    def test_score_direct_preference_direct_only_true(self):
        c = FlightCandidate(flight_number="AI302", is_direct=True)
        prefs = UserPreferences(direct_only=True)
        assert _score_direct_preference(c, prefs) == 1.0

    def test_score_direct_preference_direct_only_false(self):
        c = FlightCandidate(flight_number="AI302", is_direct=False)
        prefs = UserPreferences(direct_only=True)
        assert _score_direct_preference(c, prefs) == 0.0

    def test_score_direct_preference_no_preference(self):
        c = FlightCandidate(flight_number="AI302", is_direct=False)
        prefs = UserPreferences(direct_only=False)
        assert _score_direct_preference(c, prefs) == 0.5

    def test_score_direct_preference_unknown(self):
        c = FlightCandidate(flight_number="AI302", is_direct=None)
        prefs = UserPreferences(direct_only=True)
        assert _score_direct_preference(c, prefs) == 0.5

    def test_score_departure_convenience_no_data(self):
        c = FlightCandidate(flight_number="AI302")
        prefs = UserPreferences()
        assert _score_departure_convenience(c, prefs) == 0.5

    def test_score_departure_convenience_close_match(self):
        c = FlightCandidate(flight_number="AI302", departure_time="2025-01-15T10:00")
        prefs = UserPreferences(travel_time="10:30")
        assert _score_departure_convenience(c, prefs) == 1.0

    def test_score_departure_convenience_far_match(self):
        c = FlightCandidate(flight_number="AI302", departure_time="2025-01-15T06:00")
        prefs = UserPreferences(travel_time="18:00")
        assert _score_departure_convenience(c, prefs) == 0.2

    def test_score_weather_clear(self):
        w = WeatherInfo(airport_iata="DEL", condition="Clear sky", available=True)
        assert _score_weather_impact(w) == 1.0

    def test_score_weather_rain(self):
        w = WeatherInfo(airport_iata="DEL", condition="Light rain", available=True)
        assert _score_weather_impact(w) == 0.5

    def test_score_weather_storm(self):
        w = WeatherInfo(airport_iata="DEL", condition="Thunderstorm", available=True)
        assert _score_weather_impact(w) == 0.2

    def test_score_weather_unavailable(self):
        assert _score_weather_impact(None) == 0.5

    def test_score_weather_not_available(self):
        w = WeatherInfo(airport_iata="DEL", available=False)
        assert _score_weather_impact(w) == 0.5

    def test_score_status_active(self):
        c = FlightCandidate(flight_number="AI302", status="active")
        assert _score_direct_preference(c, UserPreferences()) == 0.5

    def test_score_delay_risk_unavailable(self):
        assert _score_weather_impact(None) == 0.5

    def test_score_airline_match_no_preference(self):
        c = FlightCandidate(flight_number="AI302", airline="AI")
        prefs = UserPreferences()
        assert _score_airline_match(c, prefs) == 0.5

    def test_score_airline_match_exact(self):
        c = FlightCandidate(flight_number="AI302", airline="AI")
        prefs = UserPreferences(airline_preference="AI")
        assert _score_airline_match(c, prefs) == 1.0

    def test_score_airline_match_no_match(self):
        c = FlightCandidate(flight_number="AI302", airline="AI")
        prefs = UserPreferences(airline_preference="BA")
        assert _score_airline_match(c, prefs) == 0.3

    def test_score_flight_computes_total(self):
        c = FlightCandidate(
            flight_number="AI302",
            is_direct=True,
            departure_time="2025-01-15T10:00",
            status="active",
            airline="AI",
        )
        prefs = UserPreferences(direct_only=True, airline_preference="AI")
        sf = score_flight(c, prefs)
        assert 0.0 <= sf.score <= 1.0
        assert sf.candidate.flight_number == "AI302"
        assert "direct_preference" in sf.score_breakdown

    def test_rank_flights_sorted_descending(self):
        c1 = FlightCandidate(flight_number="AI302")
        c2 = FlightCandidate(flight_number="BA142")
        c3 = FlightCandidate(flight_number="LH400")
        sf1 = ScoredFlight(candidate=c1, score=0.9)
        sf2 = ScoredFlight(candidate=c2, score=0.7)
        sf3 = ScoredFlight(candidate=c3, score=0.95)
        ranked = rank_flights([sf1, sf2, sf3])
        assert ranked[0].score == 0.95
        assert ranked[1].score == 0.9
        assert ranked[2].score == 0.7


# ===== LLM JSON Extraction Tests =====


class TestExtractJson:
    def test_clean_json(self):
        result = _extract_json_from_llm('{"origin": "DEL"}')
        assert result["origin"] == "DEL"

    def test_markdown_fenced_json(self):
        result = _extract_json_from_llm('```json\n{"origin": "DEL"}\n```')
        assert result["origin"] == "DEL"

    def test_text_before_json(self):
        result = _extract_json_from_llm('Here is the result:\n{"origin": "DEL"}')
        assert result["origin"] == "DEL"


# ===== Node Tests =====


class TestParsePreferences:
    @pytest.mark.asyncio
    async def test_parse_success(self):
        state = RecommendationState(
            user_request="Find flights from Delhi to London tomorrow"
        )
        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(
            return_value=LLMResponse(
                content='{"origin": "DEL", "destination": "LHR", "travel_date": "2025-01-16", "direct_only": false}',
                model="test",
            )
        )
        result = await parse_preferences(state, llm)
        prefs = result["preferences"]
        assert prefs.origin == "DEL"
        assert prefs.destination == "LHR"
        assert prefs.travel_date == "2025-01-16"
        assert prefs.direct_only is False

    @pytest.mark.asyncio
    async def test_parse_llm_failure(self):
        state = RecommendationState(user_request="test")
        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(side_effect=Exception("LLM error"))
        result = await parse_preferences(state, llm)
        assert len(result["errors"]) > 0

    @pytest.mark.asyncio
    async def test_parse_llm_not_configured(self):
        state = RecommendationState(user_request="test")
        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = False
        result = await parse_preferences(state, llm)
        assert len(result["errors"]) > 0


class TestSearchFlights:
    @pytest.mark.asyncio
    async def test_search_success(self):
        state = RecommendationState(
            user_request="test",
            preferences=UserPreferences(origin="DEL", destination="BOM"),
        )
        mock_result = ToolResult(
            success=True,
            data={
                "flights": [
                    {
                        "flight_iata": "AI302",
                        "dep_iata": "DEL",
                        "arr_iata": "BOM",
                        "departure_time": "2025-01-15T10:00",
                    }
                ]
            },
        )
        with patch("app.agents.nodes.registry") as mock_reg:
            mock_reg.execute = AsyncMock(return_value=mock_result)
            result = await search_flights(state)
            assert len(result["candidate_flights"]) == 1
            assert result["candidate_flights"][0].flight_number == "AI302"

    @pytest.mark.asyncio
    async def test_search_no_flights(self):
        state = RecommendationState(
            user_request="test",
            preferences=UserPreferences(origin="DEL", destination="BOM"),
        )
        mock_result = ToolResult(success=True, data={"flights": []})
        with patch("app.agents.nodes.registry") as mock_reg:
            mock_reg.execute = AsyncMock(return_value=mock_result)
            result = await search_flights(state)
            assert result["candidate_flights"] == []
            assert "no_flights_found" in result["unavailable_data"]

    @pytest.mark.asyncio
    async def test_search_tool_failure(self):
        state = RecommendationState(
            user_request="test",
            preferences=UserPreferences(origin="DEL", destination="BOM"),
        )
        mock_result = ToolResult(success=False, error="Backend unavailable")
        with patch("app.agents.nodes.registry") as mock_reg:
            mock_reg.execute = AsyncMock(return_value=mock_result)
            result = await search_flights(state)
            assert len(result["errors"]) > 0

    @pytest.mark.asyncio
    async def test_search_no_preferences(self):
        state = RecommendationState(user_request="test")
        result = await search_flights(state)
        assert len(result["errors"]) > 0


class TestEnrichFlights:
    @pytest.mark.asyncio
    async def test_enrich_with_status(self):
        candidates = [
            FlightCandidate(flight_number="AI302", origin="DEL", destination="BOM"),
        ]
        state = RecommendationState(
            user_request="test",
            candidate_flights=candidates,
        )
        mock_result = ToolResult(
            success=True,
            data={"status": "active", "aircraft": "B787"},
        )
        with patch("app.agents.nodes.registry") as mock_reg:
            mock_reg.execute = AsyncMock(return_value=mock_result)
            result = await enrich_flights(state)
            enriched = result["candidate_flights"]
            assert enriched[0].status == "active"
            assert enriched[0].aircraft == "B787"

    @pytest.mark.asyncio
    async def test_enrich_empty_candidates(self):
        state = RecommendationState(user_request="test", candidate_flights=[])
        result = await enrich_flights(state)
        assert result == {}


class TestGetWeather:
    @pytest.mark.asyncio
    async def test_weather_success(self):
        state = RecommendationState(
            user_request="test",
            preferences=UserPreferences(origin="DEL", destination="BOM"),
        )
        mock_result = ToolResult(
            success=True,
            data={"temperature": 25.0, "weatherCondition": "Clear sky", "windSpeed": 12.0},
        )
        with patch("app.agents.nodes.registry") as mock_reg:
            mock_reg.execute = AsyncMock(return_value=mock_result)
            result = await get_weather(state)
            weather = result["weather_data"]
            assert "DEL" in weather
            assert "BOM" in weather
            assert weather["DEL"].available is True
            assert weather["DEL"].temperature == 25.0
            assert weather["BOM"].available is True

    @pytest.mark.asyncio
    async def test_weather_failure(self):
        state = RecommendationState(
            user_request="test",
            preferences=UserPreferences(origin="DEL"),
        )
        mock_result = ToolResult(success=False, error="Weather unavailable")
        with patch("app.agents.nodes.registry") as mock_reg:
            mock_reg.execute = AsyncMock(return_value=mock_result)
            result = await get_weather(state)
            weather = result["weather_data"]
            assert weather["DEL"].available is False
            assert "weather_DEL" in result["unavailable_data"]

    @pytest.mark.asyncio
    async def test_weather_no_preferences(self):
        state = RecommendationState(user_request="test")
        result = await get_weather(state)
        assert result == {}


class TestGetPredictions:
    @pytest.mark.asyncio
    async def test_predictions_always_unavailable(self):
        candidates = [
            FlightCandidate(flight_number="AI302"),
            FlightCandidate(flight_number="BA142"),
        ]
        state = RecommendationState(
            user_request="test", candidate_flights=candidates
        )
        result = await get_predictions(state)
        preds = result["prediction_data"]
        assert "AI302" in preds
        assert "BA142" in preds
        assert preds["AI302"].available is False
        assert preds["BA142"].available is False
        assert "delay_predictions_not_implemented" in result["unavailable_data"]


class TestScoreFlights:
    @pytest.mark.asyncio
    async def test_score_flights_basic(self):
        candidates = [
            FlightCandidate(
                flight_number="AI302",
                origin="DEL",
                destination="BOM",
                is_direct=True,
                status="active",
                departure_time="2025-01-15T10:00",
            ),
        ]
        state = RecommendationState(
            user_request="test",
            candidate_flights=candidates,
            preferences=UserPreferences(origin="DEL", destination="BOM", direct_only=True),
        )
        result = await score_flights(state)
        scored = result["scored_flights"]
        assert len(scored) == 1
        assert 0.0 <= scored[0].score <= 1.0


class TestRankFlightsNode:
    @pytest.mark.asyncio
    async def test_rank_flights_basic(self):
        c1 = FlightCandidate(flight_number="AI302")
        c2 = FlightCandidate(flight_number="BA142")
        sf1 = ScoredFlight(candidate=c1, score=0.7)
        sf2 = ScoredFlight(candidate=c2, score=0.9)
        state = RecommendationState(
            user_request="test",
            scored_flights=[sf1, sf2],
        )
        result = await rank_flights_node(state)
        ranked = result["ranked_flights"]
        assert ranked[0].score == 0.9
        assert ranked[0].candidate.flight_number == "BA142"
        assert ranked[1].score == 0.7


class TestGenerateRecommendation:
    @pytest.mark.asyncio
    async def test_generate_with_top_flight(self):
        c = FlightCandidate(
            flight_number="AI302",
            origin="DEL",
            destination="BOM",
            is_direct=True,
            status="active",
        )
        sf = ScoredFlight(
            candidate=c,
            score=0.85,
            score_breakdown={"direct_preference": 1.0},
        )
        state = RecommendationState(
            user_request="Find me a flight from Delhi to Mumbai",
            ranked_flights=[sf],
            unavailable_data=["delay_predictions_not_implemented"],
        )
        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(
            return_value=LLMResponse(
                content="Flight AI302 is recommended because it is a direct flight.",
                model="test",
            )
        )
        result = await generate_recommendation(state, llm)
        rec = result["recommendation"]
        assert rec.recommended_flight is not None
        assert rec.recommended_flight.candidate.flight_number == "AI302"
        assert "AI302" in rec.explanation
        assert rec.total_flights_evaluated == 1

    @pytest.mark.asyncio
    async def test_generate_no_flights(self):
        state = RecommendationState(
            user_request="test",
            ranked_flights=[],
            errors=[],
            unavailable_data=["no_flights_found"],
        )
        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        result = await generate_recommendation(state, llm)
        rec = result["recommendation"]
        assert rec.recommended_flight is None
        assert rec.total_flights_evaluated == 0

    @pytest.mark.asyncio
    async def test_generate_llm_failure(self):
        c = FlightCandidate(flight_number="AI302")
        sf = ScoredFlight(candidate=c, score=0.8)
        state = RecommendationState(
            user_request="test",
            ranked_flights=[sf],
        )
        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(side_effect=Exception("LLM error"))
        result = await generate_recommendation(state, llm)
        rec = result["recommendation"]
        assert rec.recommended_flight is not None
        assert len(rec.limitations) > 0

    @pytest.mark.asyncio
    async def test_generate_llm_not_configured(self):
        c = FlightCandidate(flight_number="AI302")
        sf = ScoredFlight(candidate=c, score=0.8)
        state = RecommendationState(
            user_request="test",
            ranked_flights=[sf],
        )
        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = False
        result = await generate_recommendation(state, llm)
        rec = result["recommendation"]
        assert rec.recommended_flight is not None
        assert "not configured" in " ".join(rec.limitations).lower()


# ===== LangGraph Integration Tests =====


class TestRecommendationGraph:
    def test_graph_builds(self):
        from app.agents.recommendation_agent import build_recommendation_graph

        graph = build_recommendation_graph()
        assert graph is not None

    def test_graph_compiles(self):
        from app.agents.recommendation_agent import compile_recommendation_graph

        compiled = compile_recommendation_graph()
        assert compiled is not None

    @pytest.mark.asyncio
    async def test_graph_end_to_end_no_flights(self):
        """Full graph execution with no flights found."""
        from app.agents.recommendation_agent import compile_recommendation_graph

        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(
            return_value=LLMResponse(
                content='{"origin": "DEL", "destination": "BOM", "direct_only": false}',
                model="test",
            )
        )

        compiled = compile_recommendation_graph(llm)

        mock_result = ToolResult(success=True, data={"flights": []})
        with patch("app.agents.nodes.registry") as mock_reg:
            mock_reg.execute = AsyncMock(return_value=mock_result)

            initial = RecommendationState(
                user_request="Find flights from Delhi to Mumbai"
            )
            final = await compiled.ainvoke(initial)

            assert isinstance(final, dict)
            rec = final.get("recommendation")
            assert rec is not None

    @pytest.mark.asyncio
    async def test_graph_end_to_end_with_flights(self):
        """Full graph execution with flights found."""
        from app.agents.recommendation_agent import compile_recommendation_graph

        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(
            side_effect=[
                LLMResponse(
                    content='{"origin": "DEL", "destination": "BOM", "direct_only": true}',
                    model="test",
                ),
                LLMResponse(
                    content="Flight AI302 is recommended because it is direct.",
                    model="test",
                ),
            ]
        )

        compiled = compile_recommendation_graph(llm)

        search_result = ToolResult(
            success=True,
            data={
                "flights": [
                    {
                        "flight_iata": "AI302",
                        "dep_iata": "DEL",
                        "arr_iata": "BOM",
                        "departure_time": "2025-01-15T10:00",
                        "status": "active",
                    }
                ]
            },
        )
        status_result = ToolResult(
            success=True,
            data={"status": "active", "aircraft": "B787"},
        )
        weather_result = ToolResult(
            success=True,
            data={"temperature": 25.0, "weatherCondition": "Clear"},
        )

        call_count = 0

        async def mock_execute(name, args):
            nonlocal call_count
            call_count += 1
            if name == "search_flights":
                return search_result
            elif name == "get_flight_status":
                return status_result
            elif name == "get_weather":
                return weather_result
            return ToolResult(success=False, error="unknown")

        with patch("app.agents.nodes.registry") as mock_reg:
            mock_reg.execute = AsyncMock(side_effect=mock_execute)

            initial = RecommendationState(
                user_request="Find a direct flight from Delhi to Mumbai"
            )
            final = await compiled.ainvoke(initial)

            assert isinstance(final, dict)
            rec = final.get("recommendation")
            assert rec is not None
            assert rec.recommended_flight is not None
            assert rec.recommended_flight.candidate.flight_number == "AI302"

    @pytest.mark.asyncio
    async def test_graph_end_to_end_no_preferences(self):
        """Graph handles unparseable request gracefully."""
        from app.agents.recommendation_agent import compile_recommendation_graph

        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(
            side_effect=Exception("LLM parse error")
        )

        compiled = compile_recommendation_graph(llm)

        initial = RecommendationState(user_request="hello")
        final = await compiled.ainvoke(initial)

        assert isinstance(final, dict)
        rec = final.get("recommendation")
        assert rec is not None


# ===== API Endpoint Tests =====


class TestRecommendationEndpoint:
    @pytest.mark.asyncio
    async def test_recommend_endpoint_validation(self, async_client):
        response = await async_client.post(
            "/api/ai/recommend",
            json={"query": ""},
            headers={"X-AI-Service-Key": "test-key"},
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_recommend_endpoint_missing_query(self, async_client):
        response = await async_client.post(
            "/api/ai/recommend",
            json={},
            headers={"X-AI-Service-Key": "test-key"},
        )
        assert response.status_code == 422


# ===== Security Tests =====


class TestRecommendationSecurity:
    def test_no_secrets_in_state(self):
        state = RecommendationState(user_request="test flight")
        import dataclasses

        for field in dataclasses.fields(state):
            value = getattr(state, field.name)
            if isinstance(value, str):
                assert "sk-" not in value
                assert "password" not in value.lower()

    def test_ranking_is_deterministic(self):
        c1 = FlightCandidate(flight_number="AI302")
        c2 = FlightCandidate(flight_number="BA142")
        sf1 = ScoredFlight(candidate=c1, score=0.8)
        sf2 = ScoredFlight(candidate=c2, score=0.9)

        rank1 = rank_flights([sf1, sf2])
        rank2 = rank_flights([sf2, sf1])
        assert [sf.candidate.flight_number for sf in rank1] == [
            sf.candidate.flight_number for sf in rank2
        ]

    def test_score_never_fabricates_data(self):
        c = FlightCandidate(flight_number="AI302")
        prefs = UserPreferences()
        sf = score_flight(c, prefs)
        assert sf.score >= 0.0
        assert sf.score <= 1.0
        assert sf.candidate.flight_number == "AI302"


# ===== Regression: AI-3 Tools Still Work =====


class TestAI3Regression:
    @pytest.mark.asyncio
    async def test_tool_registry_still_works(self):
        from app.tools import register_all_tools
        from app.tools.registry import registry

        register_all_tools()
        assert len(registry) == 7
        assert "search_flights" in registry.tool_names
        assert "get_weather" in registry.tool_names
        assert "get_flight_status" in registry.tool_names


# ===== Issue 1: Budget Handling Tests =====


class TestBudgetHandling:
    @pytest.mark.asyncio
    async def test_budget_requested_no_price_data_adds_limitation(self):
        """When budget is requested but no price data exists, limitation must be added."""
        c = FlightCandidate(
            flight_number="AI302",
            origin="DEL",
            destination="BOM",
            is_direct=True,
            status="active",
        )
        sf = ScoredFlight(candidate=c, score=0.85, score_breakdown={})
        prefs = UserPreferences(
            origin="DEL", destination="BOM", budget=60000, budget_currency="INR"
        )
        state = RecommendationState(
            user_request="Find flights under 60000 INR",
            ranked_flights=[sf],
            preferences=prefs,
            price_data_available=False,
            unavailable_data=["delay_predictions_not_implemented"],
        )
        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(
            return_value=LLMResponse(content="Flight AI302 is recommended.", model="test")
        )
        result = await generate_recommendation(state, llm)
        rec = result["recommendation"]
        budget_limitations = [l for l in rec.limitations if "budget" in l.lower() or "price" in l.lower()]
        assert len(budget_limitations) == 1
        assert "60000" in budget_limitations[0]
        assert "could not be verified" in budget_limitations[0].lower()

    @pytest.mark.asyncio
    async def test_budget_requested_price_available_no_budget_limitation(self):
        """When budget is requested AND price data exists, no budget limitation."""
        c = FlightCandidate(
            flight_number="AI302",
            origin="DEL",
            destination="BOM",
            price=55000.0,
        )
        sf = ScoredFlight(candidate=c, score=0.85, score_breakdown={})
        prefs = UserPreferences(
            origin="DEL", destination="BOM", budget=60000, budget_currency="INR"
        )
        state = RecommendationState(
            user_request="Find flights under 60000 INR",
            ranked_flights=[sf],
            preferences=prefs,
            price_data_available=True,
        )
        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(
            return_value=LLMResponse(content="Flight AI302 is recommended.", model="test")
        )
        result = await generate_recommendation(state, llm)
        rec = result["recommendation"]
        budget_limitations = [l for l in rec.limitations if "budget" in l.lower() or "price" in l.lower()]
        assert len(budget_limitations) == 0

    @pytest.mark.asyncio
    async def test_no_budget_requested_no_budget_limitation(self):
        """When no budget is requested, no budget limitation regardless of price data."""
        c = FlightCandidate(flight_number="AI302", origin="DEL", destination="BOM")
        sf = ScoredFlight(candidate=c, score=0.85, score_breakdown={})
        prefs = UserPreferences(origin="DEL", destination="BOM")
        state = RecommendationState(
            user_request="Find flights from Delhi to Mumbai",
            ranked_flights=[sf],
            preferences=prefs,
            price_data_available=False,
        )
        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(
            return_value=LLMResponse(content="Flight AI302 is recommended.", model="test")
        )
        result = await generate_recommendation(state, llm)
        rec = result["recommendation"]
        budget_limitations = [l for l in rec.limitations if "budget" in l.lower() or "price" in l.lower()]
        assert len(budget_limitations) == 0

    @pytest.mark.asyncio
    async def test_budget_limitation_in_llm_prompt(self):
        """LLM prompt must contain budget unavailability info when price data is missing."""
        c = FlightCandidate(flight_number="AI302", origin="DEL", destination="BOM")
        sf = ScoredFlight(candidate=c, score=0.85, score_breakdown={})
        prefs = UserPreferences(
            origin="DEL", destination="BOM", budget=60000, budget_currency="INR"
        )
        state = RecommendationState(
            user_request="Find flights under 60000 INR",
            ranked_flights=[sf],
            preferences=prefs,
            price_data_available=False,
        )
        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(
            return_value=LLMResponse(content="Recommendation.", model="test")
        )
        await generate_recommendation(state, llm)
        prompt_sent = llm.complete.call_args[0][0][0].content
        assert "60000" in prompt_sent
        assert "NOT available" in prompt_sent or "CANNOT be verified" in prompt_sent

    @pytest.mark.asyncio
    async def test_search_flights_sets_price_data_available_true(self):
        """search_flights should set price_data_available when candidates have prices."""
        state = RecommendationState(
            user_request="test",
            preferences=UserPreferences(origin="DEL", destination="BOM"),
        )
        mock_result = ToolResult(
            success=True,
            data={
                "flights": [
                    {"flight_iata": "AI302", "dep_iata": "DEL", "arr_iata": "BOM", "price": 55000},
                    {"flight_iata": "BA142", "dep_iata": "DEL", "arr_iata": "BOM", "price": None},
                ]
            },
        )
        with patch("app.agents.nodes.registry") as mock_reg:
            mock_reg.execute = AsyncMock(return_value=mock_result)
            result = await search_flights(state)
            assert result["price_data_available"] is True

    @pytest.mark.asyncio
    async def test_search_flights_sets_price_data_available_false(self):
        """search_flights should set price_data_available false when no prices."""
        state = RecommendationState(
            user_request="test",
            preferences=UserPreferences(origin="DEL", destination="BOM"),
        )
        mock_result = ToolResult(
            success=True,
            data={
                "flights": [
                    {"flight_iata": "AI302", "dep_iata": "DEL", "arr_iata": "BOM"},
                ]
            },
        )
        with patch("app.agents.nodes.registry") as mock_reg:
            mock_reg.execute = AsyncMock(return_value=mock_result)
            result = await search_flights(state)
            assert result["price_data_available"] is False


# ===== Issue 2: Enrichment Tool Verification Tests =====


class TestEnrichmentTools:
    @pytest.mark.asyncio
    async def test_enrich_uses_get_flight_status_not_tracking(self):
        """enrich_flights must call get_flight_status, not get_flight_tracking."""
        candidates = [
            FlightCandidate(flight_number="AI302", origin="DEL", destination="BOM"),
        ]
        state = RecommendationState(
            user_request="test",
            candidate_flights=candidates,
        )
        mock_result = ToolResult(
            success=True,
            data={"status": "active", "aircraft": "B787", "airline": "AI"},
        )
        with patch("app.agents.nodes.registry") as mock_reg:
            mock_reg.execute = AsyncMock(return_value=mock_result)
            await enrich_flights(state)
            mock_reg.execute.assert_called_once_with(
                "get_flight_status", {"flight_number": "AI302"}
            )

    @pytest.mark.asyncio
    async def test_enrich_does_not_call_tracking(self):
        """enrich_flights must NOT call get_flight_tracking."""
        candidates = [
            FlightCandidate(flight_number="AI302", origin="DEL", destination="BOM"),
        ]
        state = RecommendationState(
            user_request="test",
            candidate_flights=candidates,
        )
        mock_result = ToolResult(success=True, data={"status": "active"})
        with patch("app.agents.nodes.registry") as mock_reg:
            mock_reg.execute = AsyncMock(return_value=mock_result)
            await enrich_flights(state)
            for call in mock_reg.execute.call_args_list:
                assert call[0][0] != "get_flight_tracking"

    @pytest.mark.asyncio
    async def test_enrich_skips_unknown_flight_numbers(self):
        """enrich_flights must skip flights with 'unknown' flight number."""
        candidates = [
            FlightCandidate(flight_number="unknown", origin="DEL", destination="BOM"),
        ]
        state = RecommendationState(
            user_request="test",
            candidate_flights=candidates,
        )
        with patch("app.agents.nodes.registry") as mock_reg:
            mock_reg.execute = AsyncMock()
            await enrich_flights(state)
            mock_reg.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_enrich_enriches_missing_fields_only(self):
        """enrich_flights should only fill in fields that are currently None."""
        candidates = [
            FlightCandidate(
                flight_number="AI302",
                origin="DEL",
                destination="BOM",
                status="active",
                aircraft="B787",
            ),
        ]
        state = RecommendationState(
            user_request="test",
            candidate_flights=candidates,
        )
        mock_result = ToolResult(
            success=True,
            data={"status": "landed", "aircraft": "A320", "airline": "AI"},
        )
        with patch("app.agents.nodes.registry") as mock_reg:
            mock_reg.execute = AsyncMock(return_value=mock_result)
            result = await enrich_flights(state)
            enriched = result["candidate_flights"]
            assert enriched[0].status == "active"
            assert enriched[0].aircraft == "B787"
            assert enriched[0].airline == "AI"


# ===== Issue 3: API Security Tests =====


class TestAPISecurity:
    @pytest.mark.asyncio
    async def test_recommend_endpoint_no_key_when_configured(self, async_client):
        """When AI service key is configured, requests without it must be rejected."""
        from app.config import get_settings
        mock_settings = MagicMock()
        mock_settings.ai_service_api_key = "secret-key-123"
        mock_settings.spring_boot_base_url = "http://localhost:8080"
        mock_settings.cors_origins = "http://localhost:3000"
        mock_settings.log_level = "INFO"
        mock_settings.environment = "test"
        mock_settings.service_name = "test"
        get_settings.cache_clear()
        with patch("app.config.get_settings", return_value=mock_settings), \
             patch("app.main.get_settings", return_value=mock_settings):
            response = await async_client.post(
                "/api/ai/recommend",
                json={"query": "Find flights from Delhi to Mumbai"},
            )
            assert response.status_code == 401
            data = response.json()
            assert data["error"] == "UNAUTHORIZED"

    @pytest.mark.asyncio
    async def test_recommend_endpoint_wrong_key_rejected(self, async_client):
        """When AI service key is configured, wrong key must be rejected."""
        from app.config import get_settings
        mock_settings = MagicMock()
        mock_settings.ai_service_api_key = "secret-key-123"
        mock_settings.spring_boot_base_url = "http://localhost:8080"
        mock_settings.cors_origins = "http://localhost:3000"
        mock_settings.log_level = "INFO"
        mock_settings.environment = "test"
        mock_settings.service_name = "test"
        get_settings.cache_clear()
        with patch("app.config.get_settings", return_value=mock_settings), \
             patch("app.main.get_settings", return_value=mock_settings):
            response = await async_client.post(
                "/api/ai/recommend",
                json={"query": "Find flights from Delhi to Mumbai"},
                headers={"X-AI-Service-Key": "wrong-key"},
            )
            assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_chat_endpoint_same_security_as_recommend(self, async_client):
        """Both /api/ai/chat and /api/ai/recommend use the same middleware."""
        from app.config import get_settings
        mock_settings = MagicMock()
        mock_settings.ai_service_api_key = "shared-key"
        mock_settings.spring_boot_base_url = "http://localhost:8080"
        mock_settings.cors_origins = "http://localhost:3000"
        mock_settings.log_level = "INFO"
        mock_settings.environment = "test"
        mock_settings.service_name = "test"
        get_settings.cache_clear()
        with patch("app.config.get_settings", return_value=mock_settings), \
             patch("app.main.get_settings", return_value=mock_settings):
            chat_resp = await async_client.post(
                "/api/ai/chat",
                json={"message": "hello"},
            )
            recommend_resp = await async_client.post(
                "/api/ai/recommend",
                json={"query": "Find flights"},
            )
            assert chat_resp.status_code == 401
            assert recommend_resp.status_code == 401

    @pytest.mark.asyncio
    async def test_recommend_endpoint_same_key_accepted(self, async_client):
        """When correct key is provided, endpoint works (or at least doesn't 401)."""
        from app.config import get_settings
        mock_settings = MagicMock()
        mock_settings.ai_service_api_key = "test-key"
        mock_settings.spring_boot_base_url = "http://localhost:8080"
        mock_settings.cors_origins = "http://localhost:3000"
        mock_settings.log_level = "INFO"
        mock_settings.environment = "test"
        mock_settings.service_name = "test"
        get_settings.cache_clear()
        with patch("app.config.get_settings", return_value=mock_settings), \
             patch("app.main.get_settings", return_value=mock_settings):
            response = await async_client.post(
                "/api/ai/recommend",
                json={"query": "Find flights from Delhi to Mumbai"},
                headers={"X-AI-Service-Key": "test-key"},
            )
            assert response.status_code != 401


# ===== Dict→UserPreferences Coercion Regression Tests =====
# These verify that the AI-5/AI-6 type consistency fix works:
# LangGraph serializes state to dicts internally; nodes and routing
# functions must handle both dict and RecommendationState inputs.


class TestStateCoercion:
    """Tests for coerce_recommendation_state / _coerce_user_preferences."""

    def test_coerce_none_returns_empty(self):
        from app.agents.state import coerce_recommendation_state
        s = coerce_recommendation_state(None)
        assert isinstance(s, RecommendationState)
        assert s.preferences is None

    def test_coerce_recommendation_state_passthrough(self):
        from app.agents.state import coerce_recommendation_state
        prefs = UserPreferences(origin="DEL", destination="BOM", direct_only=True)
        s = RecommendationState(user_request="test", preferences=prefs)
        result = coerce_recommendation_state(s)
        assert result is s
        assert isinstance(result.preferences, UserPreferences)
        assert result.preferences.origin == "DEL"

    def test_coerce_recommendation_state_fixes_dict_preferences(self):
        from app.agents.state import coerce_recommendation_state
        prefs = UserPreferences(origin="DEL", destination="BOM")
        s = RecommendationState(user_request="test", preferences=prefs)
        # Simulate LangGraph asdict conversion
        s_dict = dataclasses.asdict(s)
        # s_dict["preferences"] is now a plain dict
        assert isinstance(s_dict["preferences"], dict)
        result = coerce_recommendation_state(s_dict)
        assert isinstance(result.preferences, UserPreferences)
        assert result.preferences.origin == "DEL"
        assert result.preferences.destination == "BOM"

    def test_coerce_plain_dict_with_preferences(self):
        from app.agents.state import coerce_recommendation_state
        state_dict = {
            "user_request": "Find flights",
            "preferences": {"origin": "DEL", "destination": "BOM", "direct_only": True, "travel_time": "evening"},
            "candidate_flights": [],
            "weather_data": {},
            "prediction_data": {},
            "scored_flights": [],
            "ranked_flights": [],
            "recommendation": None,
            "errors": [],
            "unavailable_data": [],
            "price_data_available": False,
        }
        result = coerce_recommendation_state(state_dict)
        assert isinstance(result, RecommendationState)
        assert isinstance(result.preferences, UserPreferences)
        assert result.preferences.origin == "DEL"
        assert result.preferences.destination == "BOM"
        assert result.preferences.direct_only is True
        assert result.preferences.travel_time == "evening"

    def test_coerce_plain_dict_no_preferences(self):
        from app.agents.state import coerce_recommendation_state
        state_dict = {
            "user_request": "hello",
            "preferences": None,
            "candidate_flights": [],
        }
        result = coerce_recommendation_state(state_dict)
        assert isinstance(result, RecommendationState)
        assert result.preferences is None

    def test_coerce_direct_only_false_preserved(self):
        from app.agents.state import coerce_recommendation_state
        state_dict = {
            "user_request": "test",
            "preferences": {"origin": "DEL", "destination": "BOM", "direct_only": False},
        }
        result = coerce_recommendation_state(state_dict)
        assert result.preferences.direct_only is False


class TestCoercionThroughGraph:
    """End-to-end graph tests that exercise dict coercion via stored preferences."""

    @pytest.mark.asyncio
    async def test_graph_end_to_end_with_stored_preferences(self):
        """Full graph with UserPreferences pre-loaded (simulating AI-6 merge)."""
        from app.agents.recommendation_agent import compile_recommendation_graph

        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(
            side_effect=[
                LLMResponse(
                    content='{"origin": "DEL", "destination": "BOM", "direct_only": true, "travel_time": "evening"}',
                    model="test",
                ),
                LLMResponse(
                    content="Flight AI302 is recommended as it is direct and departs in the evening.",
                    model="test",
                ),
            ]
        )
        compiled = compile_recommendation_graph(llm)

        search_result = ToolResult(
            success=True,
            data={
                "flights": [
                    {
                        "flight_iata": "AI302",
                        "dep_iata": "DEL",
                        "arr_iata": "BOM",
                        "departure_time": "2025-01-15T18:00",
                        "status": "scheduled",
                    }
                ]
            },
        )
        status_result = ToolResult(success=True, data={"status": "scheduled", "aircraft": "B787"})
        weather_result = ToolResult(success=True, data={"temperature": 20.0, "weatherCondition": "Clear"})

        async def mock_execute(name, args):
            if name == "search_flights":
                return search_result
            elif name == "get_flight_status":
                return status_result
            elif name == "get_weather":
                return weather_result
            return ToolResult(success=False, error="unknown")

        with patch("app.agents.nodes.registry") as mock_reg:
            mock_reg.execute = AsyncMock(side_effect=mock_execute)

            # Simulate AI-6: stored prefs merged before graph invocation
            stored_prefs = UserPreferences(origin="DEL", destination="BOM", direct_only=True, travel_time="evening")
            initial = RecommendationState(
                user_request="Find me a direct evening flight from Delhi to Mumbai",
                preferences=stored_prefs,
            )
            final = await compiled.ainvoke(initial)

            assert isinstance(final, dict)
            rec = final.get("recommendation")
            assert rec is not None
            # Verify preferences were preserved through the graph
            prefs = final.get("preferences")
            assert isinstance(prefs, UserPreferences)
            assert prefs.origin == "DEL"
            assert prefs.destination == "BOM"
            assert prefs.direct_only is True

    @pytest.mark.asyncio
    async def test_graph_stored_prefs_merged_with_llm_parse(self):
        """Stored direct_only=true + LLM parse of origin/dest merges correctly."""
        from app.agents.recommendation_agent import compile_recommendation_graph

        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(
            side_effect=[
                # LLM returns origin/dest but does NOT set direct_only
                LLMResponse(
                    content='{"origin": "DEL", "destination": "BOM", "direct_only": null}',
                    model="test",
                ),
                LLMResponse(content="Recommended.", model="test"),
            ]
        )
        compiled = compile_recommendation_graph(llm)

        search_result = ToolResult(
            success=True,
            data={
                "flights": [
                    {
                        "flight_iata": "AI302",
                        "dep_iata": "DEL",
                        "arr_iata": "BOM",
                        "departure_time": "2025-01-15T10:00",
                        "status": "scheduled",
                    }
                ]
            },
        )
        status_result = ToolResult(success=True, data={"status": "scheduled"})
        weather_result = ToolResult(success=True, data={"temperature": 25.0, "weatherCondition": "Clear"})

        async def mock_execute(name, args):
            if name == "search_flights":
                return search_result
            elif name == "get_flight_status":
                return status_result
            elif name == "get_weather":
                return weather_result
            return ToolResult(success=False, error="unknown")

        with patch("app.agents.nodes.registry") as mock_reg:
            mock_reg.execute = AsyncMock(side_effect=mock_execute)

            # Stored: direct_only=true, travel_time=evening
            stored_prefs = UserPreferences(direct_only=True, travel_time="evening")
            initial = RecommendationState(
                user_request="Find a flight from Delhi to Mumbai",
                preferences=stored_prefs,
            )
            final = await compiled.ainvoke(initial)

            assert isinstance(final, dict)
            prefs = final.get("preferences")
            assert isinstance(prefs, UserPreferences)
            # LLM provided origin/dest, stored direct_only preserved
            assert prefs.origin == "DEL"
            assert prefs.destination == "BOM"
            assert prefs.direct_only is True
            assert prefs.travel_time == "evening"

    @pytest.mark.asyncio
    async def test_graph_dict_state_input_coercion(self):
        """Graph receives a raw dict (as LangGraph would produce) and handles it."""
        from app.agents.recommendation_agent import compile_recommendation_graph

        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(
            side_effect=[
                LLMResponse(
                    content='{"origin": "DEL", "destination": "BOM"}',
                    model="test",
                ),
                LLMResponse(content="Recommended.", model="test"),
            ]
        )
        compiled = compile_recommendation_graph(llm)

        search_result = ToolResult(
            success=True,
            data={
                "flights": [
                    {
                        "flight_iata": "AI302",
                        "dep_iata": "DEL",
                        "arr_iata": "BOM",
                        "status": "scheduled",
                    }
                ]
            },
        )
        status_result = ToolResult(success=True, data={"status": "scheduled"})
        weather_result = ToolResult(success=True, data={"temperature": 25.0, "weatherCondition": "Clear"})

        async def mock_execute(name, args):
            if name == "search_flights":
                return search_result
            elif name == "get_flight_status":
                return status_result
            elif name == "get_weather":
                return weather_result
            return ToolResult(success=False, error="unknown")

        with patch("app.agents.nodes.registry") as mock_reg:
            mock_reg.execute = AsyncMock(side_effect=mock_execute)

            # Pass a raw dict (simulating what LangGraph produces internally)
            state_dict = {
                "user_request": "Find flights from Delhi to Mumbai",
                "preferences": None,
                "candidate_flights": [],
                "weather_data": {},
                "prediction_data": {},
                "scored_flights": [],
                "ranked_flights": [],
                "recommendation": None,
                "errors": [],
                "unavailable_data": [],
                "price_data_available": False,
            }
            final = await compiled.ainvoke(state_dict)

            assert isinstance(final, dict)
            rec = final.get("recommendation")
            assert rec is not None

    @pytest.mark.asyncio
    async def test_graph_asdict_input_coercion(self):
        """Graph receives asdict()-converted RecommendationState and handles it."""
        from app.agents.recommendation_agent import compile_recommendation_graph

        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(
            side_effect=[
                LLMResponse(
                    content='{"origin": "DEL", "destination": "BOM"}',
                    model="test",
                ),
                LLMResponse(content="Recommended.", model="test"),
            ]
        )
        compiled = compile_recommendation_graph(llm)

        search_result = ToolResult(
            success=True,
            data={
                "flights": [
                    {
                        "flight_iata": "AI302",
                        "dep_iata": "DEL",
                        "arr_iata": "BOM",
                        "status": "scheduled",
                    }
                ]
            },
        )
        status_result = ToolResult(success=True, data={"status": "scheduled"})
        weather_result = ToolResult(success=True, data={"temperature": 25.0, "weatherCondition": "Clear"})

        async def mock_execute(name, args):
            if name == "search_flights":
                return search_result
            elif name == "get_flight_status":
                return status_result
            elif name == "get_weather":
                return weather_result
            return ToolResult(success=False, error="unknown")

        with patch("app.agents.nodes.registry") as mock_reg:
            mock_reg.execute = AsyncMock(side_effect=mock_execute)

            # Create RecommendationState with stored prefs, then asdict it
            # (simulating LangGraph internal serialization)
            original = RecommendationState(
                user_request="Find flights from Delhi to Mumbai",
                preferences=UserPreferences(origin="DEL", destination="BOM"),
            )
            asdict_state = dataclasses.asdict(original)
            # preferences is now a dict
            assert isinstance(asdict_state["preferences"], dict)

            final = await compiled.ainvoke(asdict_state)

            assert isinstance(final, dict)
            rec = final.get("recommendation")
            assert rec is not None

    @pytest.mark.asyncio
    async def test_route_after_parse_with_dict_preferences(self):
        """_route_after_parse handles dict preferences without AttributeError."""
        from app.agents.recommendation_agent import _route_after_parse

        # Simulate LangGraph asdict conversion of state with preferences
        state_dict = {
            "user_request": "test",
            "preferences": {"origin": "DEL", "destination": "BOM"},
            "errors": [],
        }
        route = _route_after_parse(state_dict)
        assert route == "search_flights"

    @pytest.mark.asyncio
    async def test_route_after_parse_with_empty_dict_preferences(self):
        """_route_after_parse handles empty dict preferences."""
        from app.agents.recommendation_agent import _route_after_parse

        state_dict = {
            "user_request": "test",
            "preferences": {"origin": None, "destination": None},
            "errors": [],
        }
        route = _route_after_parse(state_dict)
        assert route == "end_no_preferences"

    @pytest.mark.asyncio
    async def test_route_after_parse_with_none_preferences(self):
        """_route_after_parse handles None preferences."""
        from app.agents.recommendation_agent import _route_after_parse

        state_dict = {
            "user_request": "test",
            "preferences": None,
            "errors": [],
        }
        route = _route_after_parse(state_dict)
        assert route == "end_no_preferences"

    @pytest.mark.asyncio
    async def test_parse_preferences_with_dict_existing(self):
        """parse_preferences handles existing dict preferences (the original bug)."""
        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(
            return_value=LLMResponse(
                content='{"origin": "DEL", "destination": "BOM"}',
                model="test",
            )
        )

        # Simulate LangGraph state: preferences is a dict (from asdict)
        state_dict = {
            "user_request": "Find flights from Delhi to Mumbai",
            "preferences": {"direct_only": True, "travel_time": "evening"},
            "errors": [],
        }

        result = await parse_preferences(state_dict, llm)
        prefs = result["preferences"]
        assert isinstance(prefs, UserPreferences)
        assert prefs.origin == "DEL"
        assert prefs.destination == "BOM"
        # Stored preferences merged
        assert prefs.direct_only is True
        assert prefs.travel_time == "evening"

    @pytest.mark.asyncio
    async def test_search_flights_with_dict_preferences(self):
        """search_flights handles dict preferences without AttributeError."""
        from app.agents.state import coerce_recommendation_state

        state_dict = {
            "user_request": "test",
            "preferences": {"origin": "DEL", "destination": "BOM"},
            "candidate_flights": [],
            "errors": [],
            "unavailable_data": [],
        }

        with patch("app.agents.nodes.registry") as mock_reg:
            mock_reg.execute = AsyncMock(return_value=ToolResult(success=True, data={"flights": []}))
            result = await search_flights(state_dict)
            assert "candidate_flights" in result

    @pytest.mark.asyncio
    async def test_get_weather_with_dict_preferences(self):
        """get_weather handles dict preferences without AttributeError."""
        state_dict = {
            "user_request": "test",
            "preferences": {"origin": "DEL", "destination": "BOM"},
            "weather_data": {},
            "unavailable_data": [],
        }

        with patch("app.agents.nodes.registry") as mock_reg:
            mock_reg.execute = AsyncMock(return_value=ToolResult(success=True, data={"temperature": 25}))
            result = await get_weather(state_dict)
            assert "weather_data" in result


# ===== IATA Normalization Tests =====


class TestIataNormalization:
    """Test normalize_iata converts city names to IATA codes."""

    def test_already_iata_code(self):
        from app.agents.nodes import normalize_iata
        assert normalize_iata("DEL") == "DEL"
        assert normalize_iata("bom") == "BOM"

    def test_city_to_iata(self):
        from app.agents.nodes import normalize_iata
        assert normalize_iata("Delhi") == "DEL"
        assert normalize_iata("mumbai") == "BOM"
        assert normalize_iata("Bangalore") == "BLR"
        assert normalize_iata("bengaluru") == "BLR"
        assert normalize_iata("Chennai") == "MAA"
        assert normalize_iata("Kolkata") == "CCU"
        assert normalize_iata("Hyderabad") == "HYD"
        assert normalize_iata("goa") == "GOI"
        assert normalize_iata("Pune") == "PNQ"

    def test_international_cities(self):
        from app.agents.nodes import normalize_iata
        assert normalize_iata("London") == "LHR"
        assert normalize_iata("new york") == "JFK"
        assert normalize_iata("Dubai") == "DXB"
        assert normalize_iata("Singapore") == "SIN"

    def test_none_and_empty(self):
        from app.agents.nodes import normalize_iata
        assert normalize_iata(None) is None
        assert normalize_iata("") is None
        assert normalize_iata("  ") is None

    def test_unknown_city_returns_none(self):
        from app.agents.nodes import normalize_iata
        assert normalize_iata("Springfield") is None
        assert normalize_iata("Atlantis") is None


# ===== CamelCase Field Mapping Tests =====


class TestCamelCaseFieldMapping:
    """Test that search_flights correctly maps Spring Boot camelCase keys."""

    @pytest.mark.asyncio
    async def test_search_flights_maps_camelcase_keys(self):
        """search_flights extracts IATA codes from camelCase keys."""
        from app.agents.state import FlightCandidate

        camelcase_flight = {
            "flightIata": "6E322",
            "departureIata": "DEL",
            "arrivalIata": "BOM",
            "departureScheduled": "2026-09-05T10:30:00+0530",
            "arrivalScheduled": "2026-09-05T12:45:00+0530",
            "airlineIata": "6E",
            "status": "scheduled",
            "aircraftIata": "A20N",
        }

        state = RecommendationState(
            user_request="test",
            preferences=UserPreferences(origin="DEL", destination="BOM"),
            errors=[],
            unavailable_data=[],
        )

        with patch("app.agents.nodes.registry") as mock_reg:
            mock_reg.execute = AsyncMock(
                return_value=ToolResult(success=True, data={"flights": [camelcase_flight]})
            )
            result = await search_flights(state)

        candidates = result["candidate_flights"]
        assert len(candidates) == 1
        c = candidates[0]
        assert c.flight_number == "6E322"
        assert c.origin == "DEL"
        assert c.destination == "BOM"
        assert c.departure_time == "2026-09-05T10:30:00+0530"
        assert c.arrival_time == "2026-09-05T12:45:00+0530"
        assert c.airline == "6E"
        assert c.status == "scheduled"
        assert c.aircraft == "A20N"

    @pytest.mark.asyncio
    async def test_search_flights_snake_case_still_works(self):
        """search_flights still handles snake_case keys (backward compat)."""
        snake_flight = {
            "flight_iata": "AI302",
            "dep_iata": "DEL",
            "arr_iata": "BOM",
            "departure_time": "2026-09-05T08:00:00+0530",
            "arrival_time": "2026-09-05T10:15:00+0530",
            "airline_iata": "AI",
            "flight_status": "active",
            "aircraft": "B787",
        }

        state = RecommendationState(
            user_request="test",
            preferences=UserPreferences(origin="DEL", destination="BOM"),
            errors=[],
            unavailable_data=[],
        )

        with patch("app.agents.nodes.registry") as mock_reg:
            mock_reg.execute = AsyncMock(
                return_value=ToolResult(success=True, data={"flights": [snake_flight]})
            )
            result = await search_flights(state)

        candidates = result["candidate_flights"]
        assert len(candidates) == 1
        c = candidates[0]
        assert c.flight_number == "AI302"
        assert c.origin == "DEL"
        assert c.destination == "BOM"
        assert c.departure_time == "2026-09-05T08:00:00+0530"

    @pytest.mark.asyncio
    async def test_infer_direct_uses_iata_keys(self):
        """_infer_direct uses departureIata/arrivalIata for comparison."""
        from app.agents.nodes import _infer_direct

        flight = {"departureIata": "DEL", "arrivalIata": "DEL"}
        assert _infer_direct(flight) is False

        flight2 = {"departureIata": "DEL", "arrivalIata": "BOM"}
        assert _infer_direct(flight2) is None


# ===== parse_preferences + normalize_iata Integration Tests =====


class TestParsePreferencesIataNormalization:
    """Test that parse_preferences normalizes city names to IATA codes."""

    @pytest.mark.asyncio
    async def test_parse_preferences_normalizes_city_names(self):
        """LLM returning city names gets normalized to IATA codes."""
        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(
            return_value=LLMResponse(
                content='{"origin": "Delhi", "destination": "Mumbai", "direct_only": false}'
            )
        )

        state = RecommendationState(
            user_request="Find me a flight from Delhi to Mumbai",
            errors=[],
            unavailable_data=[],
        )

        result = await parse_preferences(state, llm)
        prefs = result["preferences"]
        assert prefs.origin == "DEL"
        assert prefs.destination == "BOM"

    @pytest.mark.asyncio
    async def test_parse_preferences_iata_passthrough(self):
        """LLM returning correct IATA codes passes through unchanged."""
        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(
            return_value=LLMResponse(
                content='{"origin": "DEL", "destination": "BOM", "direct_only": true}'
            )
        )

        state = RecommendationState(
            user_request="Direct flight Delhi to Mumbai",
            errors=[],
            unavailable_data=[],
        )

        result = await parse_preferences(state, llm)
        prefs = result["preferences"]
        assert prefs.origin == "DEL"
        assert prefs.destination == "BOM"


# ===== Three-State direct_only Regression Tests (AI-6 → AI-5 Bug) =====


class TestDirectOnlyThreeState:
    """Regression tests for the three-state direct_only preference behavior.

    direct_only must support three states:
    - None: current request did not specify → preserve stored preference
    - True: current request explicitly asks for direct/non-stop
    - False: current request explicitly asks for connecting/stopover

    The root cause of the production bug was that the LLM prompt only allowed
    true/false, causing the LLM to return false when the user didn't mention
    directness. The is-not-None merge logic then overwrote stored true with false.
    """

    @pytest.mark.asyncio
    async def test_a_stored_true_llm_null_preserves_true(self):
        """A. Stored true + LLM returns null → final direct_only = True."""
        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(
            return_value=LLMResponse(
                content='{"origin": "DEL", "destination": "BOM", "direct_only": null}'
            )
        )
        state = RecommendationState(
            user_request="Find a flight from Delhi to Mumbai",
            preferences=UserPreferences(direct_only=True),
            errors=[],
            unavailable_data=[],
        )
        result = await parse_preferences(state, llm)
        prefs = result["preferences"]
        assert prefs.direct_only is True
        assert prefs.origin == "DEL"
        assert prefs.destination == "BOM"

    @pytest.mark.asyncio
    async def test_b_stored_true_llm_false_overrides_to_false(self):
        """B. Stored true + LLM returns false → final direct_only = False."""
        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(
            return_value=LLMResponse(
                content='{"origin": "DEL", "destination": "BOM", "direct_only": false}'
            )
        )
        state = RecommendationState(
            user_request="Find a connecting flight from Delhi to Mumbai",
            preferences=UserPreferences(direct_only=True),
            errors=[],
            unavailable_data=[],
        )
        result = await parse_preferences(state, llm)
        prefs = result["preferences"]
        assert prefs.direct_only is False

    @pytest.mark.asyncio
    async def test_c_stored_false_llm_true_overrides_to_true(self):
        """C. Stored false + LLM returns true → final direct_only = True."""
        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(
            return_value=LLMResponse(
                content='{"origin": "DEL", "destination": "BOM", "direct_only": true}'
            )
        )
        state = RecommendationState(
            user_request="Find a non-stop flight from Delhi to Mumbai",
            preferences=UserPreferences(direct_only=False),
            errors=[],
            unavailable_data=[],
        )
        result = await parse_preferences(state, llm)
        prefs = result["preferences"]
        assert prefs.direct_only is True

    @pytest.mark.asyncio
    async def test_d_stored_false_llm_null_preserves_false(self):
        """D. Stored false + LLM returns null → final direct_only = False."""
        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(
            return_value=LLMResponse(
                content='{"origin": "DEL", "destination": "BOM", "direct_only": null}'
            )
        )
        state = RecommendationState(
            user_request="Find a flight from Delhi to Mumbai",
            preferences=UserPreferences(direct_only=False),
            errors=[],
            unavailable_data=[],
        )
        result = await parse_preferences(state, llm)
        prefs = result["preferences"]
        assert prefs.direct_only is False

    @pytest.mark.asyncio
    async def test_e_no_stored_llm_null_defaults_to_false(self):
        """E. No stored preference + LLM returns null → final direct_only = False (default/neutral).

        UserPreferences.direct_only is bool (not Optional[bool]), so it defaults to False.
        False is treated as neutral (0.5) by _score_direct_preference — no preference specified.
        The three-state behavior happens at the merge level: null means "don't override existing".
        """
        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(
            return_value=LLMResponse(
                content='{"origin": "DEL", "destination": "BOM", "direct_only": null}'
            )
        )
        state = RecommendationState(
            user_request="Find a flight from Delhi to Mumbai",
            preferences=UserPreferences(),
            errors=[],
            unavailable_data=[],
        )
        result = await parse_preferences(state, llm)
        prefs = result["preferences"]
        assert prefs.direct_only is False

    @pytest.mark.asyncio
    async def test_f_production_regression_direct_only_preserved(self):
        """F. Production regression: stored direct_only=true preserved when LLM returns null."""
        from app.agents.recommendation_agent import compile_recommendation_graph

        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(
            side_effect=[
                LLMResponse(
                    content='{"origin": "DEL", "destination": "BOM", "airline_preference": "AI", "travel_time": "evening", "direct_only": null}',
                    model="test",
                ),
                LLMResponse(content="Recommended.", model="test"),
            ]
        )
        compiled = compile_recommendation_graph(llm)

        search_result = ToolResult(
            success=True,
            data={
                "flights": [
                    {
                        "flight_iata": "AI302",
                        "dep_iata": "DEL",
                        "arr_iata": "BOM",
                        "departure_time": "2025-01-15T18:00",
                        "status": "scheduled",
                    }
                ]
            },
        )
        status_result = ToolResult(success=True, data={"status": "scheduled"})
        weather_result = ToolResult(success=True, data={"temperature": 25.0, "weatherCondition": "Clear"})

        async def mock_execute(name, args):
            if name == "search_flights":
                return search_result
            elif name == "get_flight_status":
                return status_result
            elif name == "get_weather":
                return weather_result
            return ToolResult(success=False, error="unknown")

        with patch("app.agents.nodes.registry") as mock_reg:
            mock_reg.execute = AsyncMock(side_effect=mock_execute)

            stored_prefs = UserPreferences(
                direct_only=True,
                airline_preference="AI",
                travel_time="evening",
            )
            initial = RecommendationState(
                user_request="Find me a flight from Delhi to Mumbai.",
                preferences=stored_prefs,
            )
            final = await compiled.ainvoke(initial)

            assert isinstance(final, dict)
            prefs = final.get("preferences")
            assert isinstance(prefs, UserPreferences)
            assert prefs.direct_only is True, "Stored direct_only=true must be preserved"
            assert prefs.airline_preference == "AI"
            assert prefs.travel_time == "evening"
            assert prefs.origin == "DEL"
            assert prefs.destination == "BOM"

    @pytest.mark.asyncio
    async def test_g_explicit_override_stored_true_to_false(self):
        """G. Explicit override: stored true + 'connecting flight' → direct_only=false."""
        from app.agents.recommendation_agent import compile_recommendation_graph

        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(
            side_effect=[
                LLMResponse(
                    content='{"origin": "DEL", "destination": "BOM", "direct_only": false}',
                    model="test",
                ),
                LLMResponse(content="Recommended.", model="test"),
            ]
        )
        compiled = compile_recommendation_graph(llm)

        search_result = ToolResult(
            success=True,
            data={
                "flights": [
                    {
                        "flight_iata": "AI302",
                        "dep_iata": "DEL",
                        "arr_iata": "BOM",
                        "departure_time": "2025-01-15T10:00",
                        "status": "scheduled",
                    }
                ]
            },
        )
        status_result = ToolResult(success=True, data={"status": "scheduled"})
        weather_result = ToolResult(success=True, data={"temperature": 25.0, "weatherCondition": "Clear"})

        async def mock_execute(name, args):
            if name == "search_flights":
                return search_result
            elif name == "get_flight_status":
                return status_result
            elif name == "get_weather":
                return weather_result
            return ToolResult(success=False, error="unknown")

        with patch("app.agents.nodes.registry") as mock_reg:
            mock_reg.execute = AsyncMock(side_effect=mock_execute)

            stored_prefs = UserPreferences(direct_only=True)
            initial = RecommendationState(
                user_request="Find me a connecting flight from Delhi to Mumbai.",
                preferences=stored_prefs,
            )
            final = await compiled.ainvoke(initial)

            assert isinstance(final, dict)
            prefs = final.get("preferences")
            assert isinstance(prefs, UserPreferences)
            assert prefs.direct_only is False, "Explicit false must override stored true"

    @pytest.mark.asyncio
    async def test_h_ignore_saved_preferences_direct_neutral(self):
        """H. Ignore saved preferences: stored prefs not loaded, direct_only stays neutral."""
        from app.agents.recommendation_agent import compile_recommendation_graph

        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(
            side_effect=[
                LLMResponse(
                    content='{"origin": "DEL", "destination": "BOM", "direct_only": null}',
                    model="test",
                ),
                LLMResponse(content="Recommended.", model="test"),
            ]
        )
        compiled = compile_recommendation_graph(llm)

        search_result = ToolResult(
            success=True,
            data={
                "flights": [
                    {
                        "flight_iata": "AI302",
                        "dep_iata": "DEL",
                        "arr_iata": "BOM",
                        "departure_time": "2025-01-15T10:00",
                        "status": "scheduled",
                    }
                ]
            },
        )
        status_result = ToolResult(success=True, data={"status": "scheduled"})
        weather_result = ToolResult(success=True, data={"temperature": 25.0, "weatherCondition": "Clear"})

        async def mock_execute(name, args):
            if name == "search_flights":
                return search_result
            elif name == "get_flight_status":
                return status_result
            elif name == "get_weather":
                return weather_result
            return ToolResult(success=False, error="unknown")

        with patch("app.agents.nodes.registry") as mock_reg:
            mock_reg.execute = AsyncMock(side_effect=mock_execute)

            # When ignore is detected, endpoint passes no stored prefs (initial_preferences=None)
            # parse_preferences receives empty UserPreferences as initial
            initial = RecommendationState(
                user_request="Find me any flight from Delhi to Mumbai. Ignore my saved flight preferences for this request.",
                preferences=UserPreferences(),
            )
            final = await compiled.ainvoke(initial)

            assert isinstance(final, dict)
            prefs = final.get("preferences")
            assert isinstance(prefs, UserPreferences)
            # No stored prefs loaded, LLM returned null → direct_only defaults to False (neutral)
            assert prefs.direct_only is False
            assert prefs.airline_preference is None
            assert prefs.travel_time is None
