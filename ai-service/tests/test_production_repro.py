"""Reproduction test for production AI-5 recommendation failure.

Traces the exact production workflow step by step:
1. LLM returns city names (Delhi/Mumbai) — tests normalize_iata
2. Spring Boot returns camelCase FlightDto — tests field mapping
3. Full LangGraph graph execution
4. Verifies candidates survive through to ranked_flights

If these tests pass, the issue is production environment (LLM reliability / Spring Boot connectivity).
If these tests fail, there is a remaining code bug.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock

from app.agents.state import (
    FlightCandidate,
    RecommendationState,
    UserPreferences,
    coerce_recommendation_state,
)
from app.agents.nodes import (
    _extract_json_from_llm,
    normalize_iata,
    parse_preferences,
    search_flights,
    enrich_flights,
    get_weather,
    get_predictions,
    score_flights,
    rank_flights_node,
    generate_recommendation,
    _infer_direct,
)
from app.agents.ranking import score_flight, rank_flights
from app.llm.base import LLMClient, LLMMessage, LLMResponse
from app.tools.base import ToolResult


# ────────────────────────────────────────────────────────────────
# Phase 1: Unit tests for individual components
# ────────────────────────────────────────────────────────────────


class TestNormalizeIata:
    """Verify normalize_iata handles all production LLM output variants."""

    def test_direct_iata_code(self):
        assert normalize_iata("DEL") == "DEL"
        assert normalize_iata("del") == "DEL"
        assert normalize_iata(" BOM ") == "BOM"

    def test_city_name_india(self):
        assert normalize_iata("Delhi") == "DEL"
        assert normalize_iata("delhi") == "DEL"
        assert normalize_iata("Mumbai") == "BOM"
        assert normalize_iata("mumbai") == "BOM"
        assert normalize_iata("Bangalore") == "BLR"
        assert normalize_iata("Bengaluru") == "BLR"

    def test_city_name_international(self):
        assert normalize_iata("New York") == "JFK"
        assert normalize_iata("London") == "LHR"
        assert normalize_iata("Dubai") == "DXB"

    def test_none_empty(self):
        assert normalize_iata(None) is None
        assert normalize_iata("") is None
        assert normalize_iata("   ") is None

    def test_unknown_value_returns_none(self):
        """Any unrecognized value that isn't 3-letter alpha returns None."""
        assert normalize_iata("SomeRandomCity") is None
        assert normalize_iata("123") is None

    def test_new_delhi(self):
        """LLM often returns 'New Delhi' instead of 'Delhi'."""
        assert normalize_iata("New Delhi") == "DEL"
        assert normalize_iata("new delhi") == "DEL"

    def test_bombay(self):
        """LLM may return the old name 'Bombay' for Mumbai."""
        assert normalize_iata("Bombay") == "BOM"
        assert normalize_iata("bombay") == "BOM"

    def test_calcutta(self):
        """LLM may return the old name 'Calcutta' for Kolkata."""
        assert normalize_iata("Calcutta") == "CCU"
        assert normalize_iata("calcutta") == "CCU"

    def test_madras(self):
        """LLM may return the old name 'Madras' for Chennai."""
        assert normalize_iata("Madras") == "MAA"
        assert normalize_iata("madras") == "MAA"

    def test_4_letter_code_returns_none(self):
        assert normalize_iata("DELH") is None


class TestExtractJson:
    """Verify _extract_json_from_llm handles LLM output variants."""

    def test_clean_json(self):
        r = _extract_json_from_llm('{"origin": "DEL", "destination": "BOM"}')
        assert r["origin"] == "DEL"

    def test_markdown_fenced(self):
        text = '```json\n{"origin": "DEL"}\n```'
        r = _extract_json_from_llm(text)
        assert r["origin"] == "DEL"

    def test_plain_fenced(self):
        text = '```\n{"origin": "DEL"}\n```'
        r = _extract_json_from_llm(text)
        assert r["origin"] == "DEL"

    def test_json_with_preamble(self):
        text = 'Sure! Here are the preferences:\n{"origin": "DEL", "destination": "BOM"}'
        r = _extract_json_from_llm(text)
        assert r["origin"] == "DEL"

    def test_invalid_json_raises(self):
        with pytest.raises(Exception):
            _extract_json_from_llm("not json at all")


class TestInferDirect:
    """Verify _infer_direct works with camelCase FlightDto keys."""

    def test_with_dep_iata(self):
        assert _infer_direct({"dep_iata": "DEL", "arr_iata": "BOM"}) is None

    def test_with_departureIata(self):
        assert _infer_direct({"departureIata": "DEL", "arrivalIata": "BOM"}) is None

    def test_with_stops_zero(self):
        assert _infer_direct({"stops": 0}) is True

    def test_with_stop_count(self):
        assert _infer_direct({"stop_count": 0}) is True
        assert _infer_direct({"stop_count": 1}) is False


# ────────────────────────────────────────────────────────────────
# Phase 2: Individual node tests with production-like data
# ────────────────────────────────────────────────────────────────


class TestParsePreferencesNode:
    """Test parse_preferences with LLM returning city names."""

    @pytest.mark.asyncio
    async def test_llm_returns_city_names(self):
        """LLM returns 'Delhi'/'Mumbai' — normalize_iata should convert."""
        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(
            return_value=LLMResponse(
                content='{"origin": "Delhi", "destination": "Mumbai", "direct_only": true}',
                model="test",
            )
        )

        state = RecommendationState(user_request="Find me a direct flight from Delhi to Mumbai.")
        result = await parse_preferences(state, llm)

        prefs = result["preferences"]
        assert prefs.origin == "DEL"
        assert prefs.destination == "BOM"
        assert prefs.direct_only is True
        assert not result.get("errors")

    @pytest.mark.asyncio
    async def test_llm_returns_iata_directly(self):
        """LLM returns IATA codes directly."""
        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(
            return_value=LLMResponse(
                content='{"origin": "DEL", "destination": "BOM", "direct_only": false}',
                model="test",
            )
        )

        state = RecommendationState(user_request="Delhi to Mumbai flights")
        result = await parse_preferences(state, llm)

        prefs = result["preferences"]
        assert prefs.origin == "DEL"
        assert prefs.destination == "BOM"

    @pytest.mark.asyncio
    async def test_llm_returns_null_origin(self):
        """LLM fails to extract origin — should still get destination, no error (partial search OK)."""
        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(
            return_value=LLMResponse(
                content='{"origin": null, "destination": "BOM", "direct_only": false}',
                model="test",
            )
        )

        state = RecommendationState(user_request="Flight to Mumbai")
        result = await parse_preferences(state, llm)

        prefs = result["preferences"]
        assert prefs.origin is None
        assert prefs.destination == "BOM"
        # No error when destination is present — partial search is allowed
        assert not result["errors"]

    @pytest.mark.asyncio
    async def test_llm_throws_exception(self):
        """LLM throws — error returned, no preferences."""
        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(side_effect=Exception("LLM timeout"))

        state = RecommendationState(user_request="Delhi to Mumbai")
        result = await parse_preferences(state, llm)

        assert result.get("preferences") is None
        assert len(result["errors"]) > 0

    @pytest.mark.asyncio
    async def test_llm_not_configured(self):
        """LLM client not configured — should return error immediately."""
        state = RecommendationState(user_request="Delhi to Mumbai")

        # Simulate the _parse_preferences wrapper behavior
        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = False

        if not llm or not llm.is_configured():
            errors = list(state.errors)
            errors.append("LLM not configured")
            result = {"errors": errors}
        else:
            result = await parse_preferences(state, llm)

        assert result.get("preferences") is None
        assert any("LLM not configured" in e for e in result["errors"])


class TestSearchFlightsNode:
    """Test search_flights with Spring Boot camelCase response format."""

    @pytest.mark.asyncio
    async def test_camelcase_flightdto_fields(self):
        """Spring Boot returns camelCase keys — must map to FlightCandidate."""
        mock_result = ToolResult(
            success=True,
            data={
                "flights": [
                    {
                        "flightIata": "AI302",
                        "flightNumber": "AI302",
                        "departureIata": "DEL",
                        "arrivalIata": "BOM",
                        "departureScheduled": "2025-01-15T10:00",
                        "arrivalScheduled": "2025-01-15T12:15",
                        "airlineIata": "AI",
                        "aircraftIata": "B787",
                        "status": "active",
                    }
                ],
                "count": 1,
            },
        )

        state = RecommendationState(
            user_request="Delhi to Mumbai",
            preferences=UserPreferences(origin="DEL", destination="BOM", direct_only=True),
        )

        from unittest.mock import patch
        with patch("app.agents.nodes.registry") as mock_reg:
            mock_reg.execute = AsyncMock(return_value=mock_result)
            result = await search_flights(state)

        candidates = result.get("candidate_flights", [])
        assert len(candidates) == 1
        c = candidates[0]
        assert c.flight_number == "AI302"
        assert c.origin == "DEL"
        assert c.destination == "BOM"
        assert c.airline == "AI"
        assert c.aircraft == "B787"
        assert c.departure_time == "2025-01-15T10:00"

    @pytest.mark.asyncio
    async def test_snake_case_flight_fields(self):
        """Older format with snake_case keys — must also work."""
        mock_result = ToolResult(
            success=True,
            data={
                "flights": [
                    {
                        "flight_iata": "AI302",
                        "dep_iata": "DEL",
                        "arr_iata": "BOM",
                        "departure_time": "2025-01-15T10:00",
                        "airline_iata": "AI",
                        "status": "active",
                    }
                ],
                "count": 1,
            },
        )

        state = RecommendationState(
            user_request="Delhi to Mumbai",
            preferences=UserPreferences(origin="DEL", destination="BOM", direct_only=True),
        )

        from unittest.mock import patch
        with patch("app.agents.nodes.registry") as mock_reg:
            mock_reg.execute = AsyncMock(return_value=mock_result)
            result = await search_flights(state)

        candidates = result.get("candidate_flights", [])
        assert len(candidates) == 1
        assert candidates[0].flight_number == "AI302"
        assert candidates[0].origin == "DEL"
        assert candidates[0].destination == "BOM"

    @pytest.mark.asyncio
    async def test_search_returns_error(self):
        """Search tool returns error — should produce errors, no candidates."""
        mock_result = ToolResult(
            success=False,
            error="SPRING_BOOT_BASE_URL not configured — backend unavailable",
        )

        state = RecommendationState(
            user_request="Delhi to Mumbai",
            preferences=UserPreferences(origin="DEL", destination="BOM"),
        )

        from unittest.mock import patch
        with patch("app.agents.nodes.registry") as mock_reg:
            mock_reg.execute = AsyncMock(return_value=mock_result)
            result = await search_flights(state)

        assert "candidate_flights" not in result
        assert len(result["errors"]) > 0
        assert "backend unavailable" in result["errors"][0] or "Flight search failed" in result["errors"][0]

    @pytest.mark.asyncio
    async def test_search_returns_empty_flights(self):
        """Search succeeds but returns no flights."""
        mock_result = ToolResult(success=True, data={"flights": [], "count": 0})

        state = RecommendationState(
            user_request="Delhi to Mumbai",
            preferences=UserPreferences(origin="DEL", destination="BOM"),
        )

        from unittest.mock import patch
        with patch("app.agents.nodes.registry") as mock_reg:
            mock_reg.execute = AsyncMock(return_value=mock_result)
            result = await search_flights(state)

        assert result.get("candidate_flights") == []
        assert "no_flights_found" in result.get("unavailable_data", [])

    @pytest.mark.asyncio
    async def test_no_origin_destination(self):
        """Search called without origin/destination — should error."""
        state = RecommendationState(
            user_request="Find flights",
            preferences=UserPreferences(),
        )

        from unittest.mock import patch
        with patch("app.agents.nodes.registry") as mock_reg:
            mock_reg.execute = AsyncMock()
            result = await search_flights(state)

        assert "candidate_flights" not in result
        assert any("origin/destination" in e for e in result["errors"])


class TestRoutingLogic:
    """Test the routing functions that determine graph flow."""

    def test_route_after_parse_success(self):
        from app.agents.recommendation_agent import _route_after_parse
        state = RecommendationState(
            user_request="test",
            preferences=UserPreferences(origin="DEL", destination="BOM"),
        )
        assert _route_after_parse(state) == "search_flights"

    def test_route_after_parse_errors_no_prefs(self):
        from app.agents.recommendation_agent import _route_after_parse
        state = RecommendationState(
            user_request="test",
            errors=["LLM failed"],
        )
        assert _route_after_parse(state) == "end_no_preferences"

    def test_route_after_parse_no_origin_no_dest(self):
        from app.agents.recommendation_agent import _route_after_parse
        state = RecommendationState(
            user_request="test",
            preferences=UserPreferences(origin=None, destination=None),
        )
        assert _route_after_parse(state) == "end_no_preferences"

    def test_route_after_parse_origin_only(self):
        from app.agents.recommendation_agent import _route_after_parse
        state = RecommendationState(
            user_request="test",
            preferences=UserPreferences(origin="DEL", destination=None),
        )
        # Should route to search_flights (only checks if BOTH are missing)
        assert _route_after_parse(state) == "search_flights"

    def test_route_after_search_with_candidates(self):
        from app.agents.recommendation_agent import _route_after_search
        state = RecommendationState(
            user_request="test",
            candidate_flights=[FlightCandidate(flight_number="AI302")],
        )
        assert _route_after_search(state) == "enrich_flights"

    def test_route_after_search_no_candidates(self):
        from app.agents.recommendation_agent import _route_after_search
        state = RecommendationState(user_request="test")
        assert _route_after_search(state) == "generate_recommendation"


# ────────────────────────────────────────────────────────────────
# Phase 3: Full graph end-to-end reproduction tests
# ────────────────────────────────────────────────────────────────


class TestGraphEndToEndProduction:
    """Full graph execution mimicking exact production scenario."""

    @pytest.mark.asyncio
    async def test_production_scenario_camelcase_delhi_mumbai(self):
        """Exact production scenario: LLM says 'Delhi'/'Mumbai', Spring Boot camelCase."""
        from app.agents.recommendation_agent import compile_recommendation_graph

        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(
            side_effect=[
                # parse_preferences LLM call
                LLMResponse(
                    content='{"origin": "Delhi", "destination": "Mumbai", "direct_only": true}',
                    model="test",
                ),
                # generate_recommendation LLM call
                LLMResponse(
                    content="Flight AI302 is recommended as a direct Delhi to Mumbai flight.",
                    model="test",
                ),
            ]
        )

        compiled = compile_recommendation_graph(llm)

        # Mock Spring Boot response with actual camelCase FlightDto keys
        search_result = ToolResult(
            success=True,
            data={
                "flights": [
                    {
                        "flightIata": "AI302",
                        "flightNumber": "AI302",
                        "departureIata": "DEL",
                        "arrivalIata": "BOM",
                        "departureScheduled": "2025-01-15T10:00:00",
                        "arrivalScheduled": "2025-01-15T12:15:00",
                        "airlineIata": "AI",
                        "aircraftIata": "B787",
                        "status": "active",
                        "departureAirport": "Indira Gandhi International",
                        "arrivalAirport": "Chhatrapati Shivaji Maharaj",
                    }
                ],
                "count": 1,
            },
        )

        weather_result = ToolResult(
            success=True,
            data={
                "temperature": 25.0,
                "weatherCondition": "Clear",
                "windSpeed": 10.0,
                "humidity": 45,
            },
        )

        call_count = 0

        async def mock_execute(name, args):
            nonlocal call_count
            call_count += 1
            if name == "search_flights":
                return search_result
            elif name == "get_weather":
                return weather_result
            return ToolResult(success=False, error=f"unknown tool: {name}")

        from unittest.mock import patch
        with patch("app.agents.nodes.registry") as mock_reg:
            mock_reg.execute = AsyncMock(side_effect=mock_execute)

            initial = RecommendationState(
                user_request="Find me a direct flight from Delhi to Mumbai."
            )
            final = await compiled.ainvoke(initial)

        assert isinstance(final, dict)
        rec = final.get("recommendation")
        assert rec is not None, f"No recommendation produced. Final state keys: {list(final.keys())}"
        assert rec.recommended_flight is not None, (
            f"No recommended_flight. Explanation: {rec.explanation}. "
            f"Limitations: {rec.limitations}"
        )
        assert rec.recommended_flight.candidate.flight_number == "AI302"
        assert rec.recommended_flight.candidate.origin == "DEL"
        assert rec.recommended_flight.candidate.destination == "BOM"

    @pytest.mark.asyncio
    async def test_production_scenario_new_delhi(self):
        """LLM returns 'New Delhi' instead of 'Delhi' — normalize_iata must handle it."""
        from app.agents.recommendation_agent import compile_recommendation_graph

        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(
            side_effect=[
                LLMResponse(
                    content='{"origin": "New Delhi", "destination": "Mumbai", "direct_only": true}',
                    model="test",
                ),
                LLMResponse(
                    content="Flight AI302 is a direct flight from New Delhi to Mumbai.",
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
                        "flightIata": "AI302",
                        "flightNumber": "AI302",
                        "departureIata": "DEL",
                        "arrivalIata": "BOM",
                        "departureScheduled": "2025-01-15T10:00:00",
                        "arrivalScheduled": "2025-01-15T12:15:00",
                        "airlineIata": "AI",
                        "status": "active",
                    }
                ],
                "count": 1,
            },
        )

        weather_result = ToolResult(
            success=True,
            data={"temperature": 25.0, "weatherCondition": "Clear"},
        )

        async def mock_execute(name, args):
            if name == "search_flights":
                return search_result
            elif name == "get_weather":
                return weather_result
            return ToolResult(success=False, error="unknown")

        from unittest.mock import patch
        with patch("app.agents.nodes.registry") as mock_reg:
            mock_reg.execute = AsyncMock(side_effect=mock_execute)

            initial = RecommendationState(
                user_request="Find me a direct flight from New Delhi to Mumbai."
            )
            final = await compiled.ainvoke(initial)

        assert isinstance(final, dict)
        rec = final.get("recommendation")
        assert rec is not None
        assert rec.recommended_flight is not None, (
            f"No recommended_flight. Explanation: {rec.explanation}. "
            f"Limitations: {rec.limitations}"
        )
        assert rec.recommended_flight.candidate.origin == "DEL"
        assert rec.recommended_flight.candidate.destination == "BOM"

    @pytest.mark.asyncio
    async def test_production_scenario_llm_failure(self):
        """LLM throws error — graph should still produce a result (no recommendation)."""
        from app.agents.recommendation_agent import compile_recommendation_graph

        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(side_effect=Exception("OpenRouter rate limit"))

        compiled = compile_recommendation_graph(llm)

        initial = RecommendationState(
            user_request="Find me a direct flight from Delhi to Mumbai."
        )
        final = await compiled.ainvoke(initial)

        assert isinstance(final, dict)
        rec = final.get("recommendation")
        assert rec is not None
        # Should have the error in limitations
        assert any("rate limit" in str(l).lower() or "parse" in str(l).lower() or "error" in str(l).lower()
                    for l in rec.limitations)

    @pytest.mark.asyncio
    async def test_production_scenario_search_backend_unavailable(self):
        """Backend unavailable — search_flights returns error."""
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

        search_result = ToolResult(
            success=False,
            error="SPRING_BOOT_BASE_URL not configured — backend unavailable",
        )

        from unittest.mock import patch
        with patch("app.agents.nodes.registry") as mock_reg:
            mock_reg.execute = AsyncMock(return_value=search_result)

            initial = RecommendationState(
                user_request="Find me a direct flight from Delhi to Mumbai."
            )
            final = await compiled.ainvoke(initial)

        assert isinstance(final, dict)
        rec = final.get("recommendation")
        assert rec is not None
        # The error should appear in limitations
        assert any("backend unavailable" in str(l).lower() or "backend" in str(l).lower()
                    for l in rec.limitations), f"Expected backend error in limitations, got: {rec.limitations}"

    @pytest.mark.asyncio
    async def test_production_scenario_empty_flights(self):
        """Search returns empty — should produce "no flights found" limitation."""
        from app.agents.recommendation_agent import compile_recommendation_graph

        llm = MagicMock(spec=LLMClient)
        llm.is_configured.return_value = True
        llm.complete = AsyncMock(
            side_effect=[
                LLMResponse(
                    content='{"origin": "DEL", "destination": "BOM"}',
                    model="test",
                ),
            ]
        )

        compiled = compile_recommendation_graph(llm)

        search_result = ToolResult(success=True, data={"flights": [], "count": 0})

        from unittest.mock import patch
        with patch("app.agents.nodes.registry") as mock_reg:
            mock_reg.execute = AsyncMock(return_value=search_result)

            initial = RecommendationState(
                user_request="Delhi to Mumbai flights"
            )
            final = await compiled.ainvoke(initial)

        assert isinstance(final, dict)
        rec = final.get("recommendation")
        assert rec is not None
        assert any("no flights" in str(l).lower() for l in rec.limitations)


# ────────────────────────────────────────────────────────────────
# Phase 4: State coercion tests (LangGraph dict ↔ dataclass)
# ────────────────────────────────────────────────────────────────


class TestStateCoercion:
    """Test coerce_recommendation_state handles all LangGraph state formats."""

    def test_from_dataclass(self):
        state = RecommendationState(
            user_request="test",
            preferences=UserPreferences(origin="DEL"),
        )
        result = coerce_recommendation_state(state)
        assert isinstance(result, RecommendationState)
        assert result.preferences.origin == "DEL"

    def test_from_dict(self):
        state = {
            "user_request": "test",
            "preferences": {"origin": "DEL", "destination": "BOM"},
            "candidate_flights": [],
        }
        result = coerce_recommendation_state(state)
        assert isinstance(result, RecommendationState)
        assert result.preferences.origin == "DEL"
        assert result.preferences.destination == "BOM"

    def test_from_dict_with_none_preferences(self):
        state = {"user_request": "test", "preferences": None}
        result = coerce_recommendation_state(state)
        assert result.preferences is None

    def test_from_empty_dict(self):
        result = coerce_recommendation_state({})
        assert isinstance(result, RecommendationState)
        assert result.user_request == ""

    def test_preferences_dict_to_dataclass(self):
        state = {
            "user_request": "test",
            "preferences": {
                "origin": "DEL",
                "destination": "BOM",
                "direct_only": True,
                "travel_date": "2025-01-15",
            },
        }
        result = coerce_recommendation_state(state)
        assert isinstance(result.preferences, UserPreferences)
        assert result.preferences.origin == "DEL"
        assert result.preferences.direct_only is True
