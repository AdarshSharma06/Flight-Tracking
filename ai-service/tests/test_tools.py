"""Tests for AI-3 tool system."""

import json
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.tools.base import Tool, ToolResult
from app.tools.registry import ToolRegistry, registry
from app.tools.flight_tools import GetFlightStatusTool, GetFlightTrackingTool
from app.tools.airport_tools import (
    GetAirportInformationTool,
    GetAirportDeparturesTool,
    GetAirportArrivalsTool,
)
from app.tools.weather_tools import GetWeatherTool
from app.tools.flight_search import SearchFlightsTool
from app.llm.base import LLMClient, LLMMessage, LLMResponse, ToolCall


# ===== Tool Base & Registry =====

class TestToolBase:
    def test_tool_result_success_content(self):
        result = ToolResult(success=True, data={"status": "active"})
        content = result.to_content()
        parsed = json.loads(content)
        assert parsed["status"] == "active"

    def test_tool_result_error_content(self):
        result = ToolResult(success=False, error="Not found")
        assert result.to_content() == "Error: Not found"

    def test_tool_result_none_data(self):
        result = ToolResult(success=True, data=None)
        assert result.to_content() == "No data available"

    def test_tool_result_string_data(self):
        result = ToolResult(success=True, data="hello")
        assert result.to_content() == "hello"

    def test_tool_definition_format(self):
        tool = GetFlightStatusTool()
        defn = tool.get_definition()
        assert defn["type"] == "function"
        assert defn["function"]["name"] == "get_flight_status"
        assert "description" in defn["function"]
        assert "parameters" in defn["function"]


class TestToolRegistry:
    def test_register_and_get(self):
        reg = ToolRegistry()
        tool = GetFlightStatusTool()
        reg.register(tool)
        assert reg.get("get_flight_status") is tool

    def test_get_unknown_tool(self):
        reg = ToolRegistry()
        assert reg.get("nonexistent") is None

    def test_get_definitions(self):
        reg = ToolRegistry()
        reg.register(GetFlightStatusTool())
        reg.register(GetWeatherTool())
        defs = reg.get_definitions()
        assert len(defs) == 2
        names = {d["function"]["name"] for d in defs}
        assert "get_flight_status" in names
        assert "get_weather" in names

    def test_len(self):
        reg = ToolRegistry()
        assert len(reg) == 0
        reg.register(GetFlightStatusTool())
        assert len(reg) == 1

    def test_tool_names(self):
        reg = ToolRegistry()
        reg.register(GetFlightStatusTool())
        reg.register(GetWeatherTool())
        assert set(reg.tool_names) == {"get_flight_status", "get_weather"}

    @pytest.mark.asyncio
    async def test_execute_unknown_tool(self):
        reg = ToolRegistry()
        result = await reg.execute("nonexistent", {})
        assert not result.success
        assert "Unknown tool" in result.error

    @pytest.mark.asyncio
    async def test_execute_missing_required_arg(self):
        reg = ToolRegistry()
        reg.register(GetFlightStatusTool())
        result = await reg.execute("get_flight_status", {})
        assert not result.success
        assert "Missing required parameter" in result.error

    @pytest.mark.asyncio
    async def test_execute_tool_success(self):
        reg = ToolRegistry()
        tool = GetFlightStatusTool()
        reg.register(tool)
        with patch("app.tools.flight_tools.client.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = {"flightNumber": "AI302", "status": "active"}
            result = await reg.execute("get_flight_status", {"flight_number": "AI302"})
            assert result.success
            assert result.data["flightNumber"] == "AI302"


# ===== Flight Tools =====

class TestGetFlightStatus:
    @pytest.mark.asyncio
    async def test_success(self):
        tool = GetFlightStatusTool()
        assert tool.name == "get_flight_status"
        with patch("app.tools.flight_tools.client.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = {"flightNumber": "AI302", "status": "active"}
            result = await tool.execute(flight_number="AI302")
            assert result.success
            mock_get.assert_called_once_with("/api/ai/proxy/flights/AI302")

    @pytest.mark.asyncio
    async def test_empty_flight_number(self):
        tool = GetFlightStatusTool()
        result = await tool.execute(flight_number="")
        assert not result.success
        assert "required" in result.error

    @pytest.mark.asyncio
    async def test_backend_error(self):
        tool = GetFlightStatusTool()
        with patch("app.tools.flight_tools.client.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = {"error": "Flight not found"}
            result = await tool.execute(flight_number="XYZ999")
            assert not result.success
            assert "not found" in result.error.lower()


class TestGetFlightTracking:
    @pytest.mark.asyncio
    async def test_success_with_position(self):
        tool = GetFlightTrackingTool()
        with patch("app.tools.flight_tools.client.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = {
                "flightNumber": "AI302",
                "latitude": 28.5,
                "longitude": 77.1,
                "altitude": 35000,
            }
            result = await tool.execute(flight_number="AI302")
            assert result.success
            assert result.data["live_data_available"] is True

    @pytest.mark.asyncio
    async def test_success_without_position(self):
        tool = GetFlightTrackingTool()
        with patch("app.tools.flight_tools.client.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = {
                "flightNumber": "AI302",
                "latitude": None,
                "longitude": None,
            }
            result = await tool.execute(flight_number="AI302")
            assert result.success
            assert result.data["live_data_available"] is False

    @pytest.mark.asyncio
    async def test_empty_flight_number(self):
        tool = GetFlightTrackingTool()
        result = await tool.execute(flight_number="")
        assert not result.success


# ===== Airport Tools =====

class TestGetAirportInformation:
    @pytest.mark.asyncio
    async def test_success(self):
        tool = GetAirportInformationTool()
        with patch("app.tools.airport_tools.client.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = {"iata": "DEL", "name": "Indira Gandhi International"}
            result = await tool.execute(iata="DEL")
            assert result.success
            mock_get.assert_called_once_with("/api/ai/proxy/airports/DEL")

    @pytest.mark.asyncio
    async def test_invalid_iata(self):
        tool = GetAirportInformationTool()
        result = await tool.execute(iata="X")
        assert not result.success
        assert "3-letter" in result.error


class TestGetAirportDepartures:
    @pytest.mark.asyncio
    async def test_success(self):
        tool = GetAirportDeparturesTool()
        with patch("app.tools.airport_tools.client.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = {"airport": "DEL", "flights": [], "count": 0}
            result = await tool.execute(iata="DEL", limit=5)
            assert result.success
            mock_get.assert_called_once_with("/api/ai/proxy/airports/DEL/departures", params={"limit": 5})

    @pytest.mark.asyncio
    async def test_limit_clamping(self):
        tool = GetAirportDeparturesTool()
        with patch("app.tools.airport_tools.client.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = {"airport": "DEL", "flights": []}
            await tool.execute(iata="DEL", limit=200)
            call_params = mock_get.call_args[1]["params"]
            assert call_params["limit"] == 100


class TestGetAirportArrivals:
    @pytest.mark.asyncio
    async def test_success(self):
        tool = GetAirportArrivalsTool()
        with patch("app.tools.airport_tools.client.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = {"airport": "JFK", "flights": []}
            result = await tool.execute(iata="JFK")
            assert result.success
            mock_get.assert_called_once_with("/api/ai/proxy/airports/JFK/arrivals", params={"limit": 10})


# ===== Weather Tool =====

class TestGetWeather:
    @pytest.mark.asyncio
    async def test_success(self):
        tool = GetWeatherTool()
        with patch("app.tools.weather_tools.client.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = {"temperature": 25.0, "weatherCondition": "Clear sky"}
            result = await tool.execute(iata="DEL")
            assert result.success
            mock_get.assert_called_once_with("/api/ai/proxy/weather/airport/DEL")

    @pytest.mark.asyncio
    async def test_invalid_iata(self):
        tool = GetWeatherTool()
        result = await tool.execute(iata="DE")
        assert not result.success


# ===== Flight Search Tool =====

class TestSearchFlights:
    @pytest.mark.asyncio
    async def test_search_by_route(self):
        tool = SearchFlightsTool()
        with patch("app.tools.flight_search.client.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = {"flights": [], "count": 0}
            result = await tool.execute(dep_iata="DEL", arr_iata="BOM")
            assert result.success
            call_params = mock_get.call_args[1]["params"]
            assert call_params["dep_iata"] == "DEL"
            assert call_params["arr_iata"] == "BOM"

    @pytest.mark.asyncio
    async def test_no_criteria_error(self):
        tool = SearchFlightsTool()
        result = await tool.execute()
        assert not result.success
        assert "At least one" in result.error

    @pytest.mark.asyncio
    async def test_limit_clamping(self):
        tool = SearchFlightsTool()
        with patch("app.tools.flight_search.client.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = {"flights": []}
            await tool.execute(dep_iata="DEL", limit=0)
            call_params = mock_get.call_args[1]["params"]
            assert call_params["limit"] == 1


# ===== Spring Boot Client =====

class TestSpringBootClient:
    @pytest.mark.asyncio
    async def test_client_request_success(self):
        from app.tools import client
        with patch("app.tools.client.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
                spring_boot_base_url="http://localhost:8080",
                ai_service_api_key="test-key",
            )
            mock_http = AsyncMock()
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.raise_for_status = MagicMock()
            mock_response.json.return_value = {"status": "UP"}
            mock_http.request = AsyncMock(return_value=mock_response)

            with patch("app.tools.client.httpx.AsyncClient", return_value=mock_http):
                client._client = None
                result = await client.get("/api/ai/proxy/flights/AI302")
                assert result == {"status": "UP"}


# ===== LLM Tool Calling =====

class TestLLMToolCalling:
    def test_llm_response_with_tool_calls(self):
        resp = LLMResponse(
            content=None,
            model="test",
            tool_calls=[
                ToolCall(id="c1", name="get_flight_status", arguments={"flight_number": "AI302"})
            ],
            finish_reason="tool_calls",
        )
        assert len(resp.tool_calls) == 1
        assert resp.tool_calls[0].name == "get_flight_status"
        assert resp.tool_calls[0].arguments["flight_number"] == "AI302"
        assert resp.finish_reason == "tool_calls"

    def test_llm_message_with_tool_calls(self):
        msg = LLMMessage(
            role="assistant",
            content=None,
            tool_calls=[{"id": "c1", "type": "function", "function": {"name": "test", "arguments": "{}"}}],
        )
        d = msg.to_dict()
        assert d["role"] == "assistant"
        assert d["tool_calls"] is not None
        assert "content" not in d

    def test_llm_message_tool_role(self):
        msg = LLMMessage(role="tool", content="result", tool_call_id="c1")
        d = msg.to_dict()
        assert d["role"] == "tool"
        assert d["tool_call_id"] == "c1"


# ===== Security: arbitrary tool rejection =====

class TestToolSecurity:
    @pytest.mark.asyncio
    async def test_unknown_tool_rejected(self):
        reg = ToolRegistry()
        result = await reg.execute("os.system", {"cmd": "rm -rf /"})
        assert not result.success
        assert "Unknown tool" in result.error

    @pytest.mark.asyncio
    async def test_no_arbitrary_execution(self):
        """Verify tools can only be registered Tool subclasses."""
        reg = ToolRegistry()
        reg.register(GetFlightStatusTool())
        assert reg.get("get_flight_status") is not None
        assert reg.get("__import__") is None
        assert reg.get("eval") is None
        assert reg.get("exec") is None

    def test_all_registered_tools_are_safe(self):
        """Verify all tools in the global registry are known Tool subclasses."""
        from app.tools import register_all_tools
        register_all_tools()
        for name in registry.tool_names:
            tool = registry.get(name)
            assert isinstance(tool, Tool), f"{name} is not a Tool subclass"
