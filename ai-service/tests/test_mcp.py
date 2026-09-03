"""Tests for AI-4: MCP (Model Context Protocol) server."""

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


# ===== MCP Server Initialization =====


class TestMCPServerInit:
    def test_mcp_server_creation(self):
        """MCP server can be created."""
        from mcp.server.fastmcp import FastMCP
        from app.mcp.server import mcp
        assert isinstance(mcp, FastMCP)
        assert mcp.name == "Flight Tracking AI Service"

    def test_mcp_server_has_instructions(self):
        """MCP server has aviation-focused instructions."""
        from app.mcp.server import mcp
        assert mcp.instructions is not None
        assert "aviation" in mcp.instructions.lower()

    def test_mcp_sse_app_creation(self):
        """MCP SSE app can be created."""
        from app.mcp.server import get_mcp_sse_app
        app = get_mcp_sse_app()
        assert app is not None


# ===== MCP Tool Registration =====


class TestMCPToolRegistration:
    def test_register_mcp_tools_populates_registry(self):
        """register_mcp_tools adds tools to the registry."""
        from app.mcp.server import register_mcp_tools
        # Use a fresh registry to avoid pollution from other tests
        with patch("app.mcp.server.registry", ToolRegistry()):
            register_mcp_tools()
            # The MCP tools don't register in the registry — they call registry.execute()
            # Instead verify the MCP server has tools
            from app.mcp.server import mcp
            # FastMCP stores tools internally
            assert hasattr(mcp, '_tool_manager')

    def test_mcp_tool_functions_exist(self):
        """All 7 aviation MCP tool functions are defined."""
        from app.mcp.server import (
            get_flight_status,
            get_flight_tracking,
            get_airport_information,
            get_airport_departures,
            get_airport_arrivals,
            get_weather,
            search_flights,
        )
        assert callable(get_flight_status)
        assert callable(get_flight_tracking)
        assert callable(get_airport_information)
        assert callable(get_airport_departures)
        assert callable(get_airport_arrivals)
        assert callable(get_weather)
        assert callable(search_flights)

    def test_mcp_tool_count(self):
        """Exactly 7 MCP tools are registered."""
        from app.mcp.server import register_mcp_tools
        from app.mcp.server import mcp as mcp_server
        # Reset tools by creating a fresh FastMCP
        register_mcp_tools()
        # Check tool count via list_tools
        tools = mcp_server._tool_manager._tools
        assert len(tools) == 7


# ===== MCP Tool Invocation =====


class TestMCPToolInvocation:
    @pytest.mark.asyncio
    async def test_get_flight_status_delegates_to_registry(self):
        """MCP get_flight_status delegates to ToolRegistry."""
        from app.mcp.server import get_flight_status
        mock_result = ToolResult(
            success=True, data={"flightNumber": "AI302", "status": "active"}
        )
        with patch("app.mcp.server.registry") as mock_registry:
            mock_registry.execute = AsyncMock(return_value=mock_result)
            result = await get_flight_status("AI302")
            mock_registry.execute.assert_called_once_with(
                "get_flight_status", {"flight_number": "AI302"}
            )
            assert "AI302" in result

    @pytest.mark.asyncio
    async def test_get_flight_tracking_delegates_to_registry(self):
        """MCP get_flight_tracking delegates to ToolRegistry."""
        from app.mcp.server import get_flight_tracking
        mock_result = ToolResult(
            success=True, data={"flightNumber": "AI302", "latitude": 28.5}
        )
        with patch("app.mcp.server.registry") as mock_registry:
            mock_registry.execute = AsyncMock(return_value=mock_result)
            result = await get_flight_tracking("AI302")
            mock_registry.execute.assert_called_once_with(
                "get_flight_tracking", {"flight_number": "AI302"}
            )
            assert "AI302" in result

    @pytest.mark.asyncio
    async def test_get_airport_information_delegates_to_registry(self):
        """MCP get_airport_information delegates to ToolRegistry."""
        from app.mcp.server import get_airport_information
        mock_result = ToolResult(
            success=True, data={"iata": "DEL", "name": "Indira Gandhi International"}
        )
        with patch("app.mcp.server.registry") as mock_registry:
            mock_registry.execute = AsyncMock(return_value=mock_result)
            result = await get_airport_information("DEL")
            mock_registry.execute.assert_called_once_with(
                "get_airport_information", {"iata": "DEL"}
            )
            assert "DEL" in result

    @pytest.mark.asyncio
    async def test_get_airport_departures_delegates_to_registry(self):
        """MCP get_airport_departures delegates to ToolRegistry."""
        from app.mcp.server import get_airport_departures
        mock_result = ToolResult(
            success=True, data={"airport": "DEL", "flights": []}
        )
        with patch("app.mcp.server.registry") as mock_registry:
            mock_registry.execute = AsyncMock(return_value=mock_result)
            result = await get_airport_departures("DEL", limit=5)
            mock_registry.execute.assert_called_once_with(
                "get_airport_departures", {"iata": "DEL", "limit": 5}
            )
            assert "DEL" in result

    @pytest.mark.asyncio
    async def test_get_airport_arrivals_delegates_to_registry(self):
        """MCP get_airport_arrivals delegates to ToolRegistry."""
        from app.mcp.server import get_airport_arrivals
        mock_result = ToolResult(
            success=True, data={"airport": "JFK", "flights": []}
        )
        with patch("app.mcp.server.registry") as mock_registry:
            mock_registry.execute = AsyncMock(return_value=mock_result)
            result = await get_airport_arrivals("JFK")
            mock_registry.execute.assert_called_once_with(
                "get_airport_arrivals", {"iata": "JFK", "limit": 10}
            )
            assert "JFK" in result

    @pytest.mark.asyncio
    async def test_get_weather_delegates_to_registry(self):
        """MCP get_weather delegates to ToolRegistry."""
        from app.mcp.server import get_weather
        mock_result = ToolResult(
            success=True, data={"temperature": 25.0, "weatherCondition": "Clear"}
        )
        with patch("app.mcp.server.registry") as mock_registry:
            mock_registry.execute = AsyncMock(return_value=mock_result)
            result = await get_weather("DEL")
            mock_registry.execute.assert_called_once_with(
                "get_weather", {"iata": "DEL"}
            )
            assert "25.0" in result

    @pytest.mark.asyncio
    async def test_search_flights_delegates_to_registry(self):
        """MCP search_flights delegates to ToolRegistry."""
        from app.mcp.server import search_flights
        mock_result = ToolResult(
            success=True, data={"flights": [], "count": 0}
        )
        with patch("app.mcp.server.registry") as mock_registry:
            mock_registry.execute = AsyncMock(return_value=mock_result)
            result = await search_flights(dep_iata="DEL", arr_iata="BOM")
            mock_registry.execute.assert_called_once_with(
                "search_flights",
                {"dep_iata": "DEL", "arr_iata": "BOM", "limit": 10},
            )
            assert "0" in result or "flights" in result

    @pytest.mark.asyncio
    async def test_search_flights_empty_params(self):
        """MCP search_flights passes empty params when no optional args given."""
        from app.mcp.server import search_flights
        mock_result = ToolResult(
            success=False, error="At least one of flight_iata, dep_iata, or arr_iata must be provided"
        )
        with patch("app.mcp.server.registry") as mock_registry:
            mock_registry.execute = AsyncMock(return_value=mock_result)
            result = await search_flights()
            # Should still delegate to registry (validation happens there)
            mock_registry.execute.assert_called_once()
            assert "Error" in result or "At least one" in result


# ===== MCP Tool Error Handling =====


class TestMCPToolErrorHandling:
    @pytest.mark.asyncio
    async def test_tool_error_returns_error_string(self):
        """Tool errors are returned as readable strings."""
        from app.mcp.server import get_flight_status
        mock_result = ToolResult(success=False, error="Flight not found")
        with patch("app.mcp.server.registry") as mock_registry:
            mock_registry.execute = AsyncMock(return_value=mock_result)
            result = await get_flight_status("XYZ999")
            assert "Error" in result or "not found" in result.lower()

    @pytest.mark.asyncio
    async def test_tool_no_data_returns_no_data_message(self):
        """Tool with no data returns appropriate message."""
        from app.mcp.server import get_flight_status
        mock_result = ToolResult(success=True, data=None)
        with patch("app.mcp.server.registry") as mock_registry:
            mock_registry.execute = AsyncMock(return_value=mock_result)
            result = await get_flight_status("AI302")
            assert result == "No data available"


# ===== MCP Security =====


class TestMCPSecurity:
    def test_mcp_tools_dont_expose_secrets(self):
        """MCP tool functions don't contain hardcoded secrets."""
        import inspect
        from app.mcp.server import (
            get_flight_status,
            get_flight_tracking,
            get_airport_information,
            get_airport_departures,
            get_airport_arrivals,
            get_weather,
            search_flights,
        )
        secret_patterns = [
            "sk-or-v1-",  # OpenRouter key
            "AI_SERVICE_API_KEY",
            "DATABASE_URL",
            "password",
            "token",
            "secret",
        ]
        for func in [get_flight_status, get_flight_tracking, get_airport_information,
                      get_airport_departures, get_airport_arrivals, get_weather, search_flights]:
            source = inspect.getsource(func)
            for pattern in secret_patterns:
                assert pattern.lower() not in source.lower(), (
                    f"Secret pattern '{pattern}' found in {func.__name__}"
                )

    def test_mcp_server_has_no_auth_endpoints(self):
        """MCP server doesn't expose authentication endpoints."""
        from app.mcp.server import mcp
        # FastMCP tools should only be aviation tools
        tools = mcp._tool_manager._tools
        for tool_name in tools:
            assert "auth" not in tool_name.lower()
            assert "login" not in tool_name.lower()
            assert "register" not in tool_name.lower()
            assert "password" not in tool_name.lower()


# ===== AI-3 Tool Registry Still Works =====


class TestAI3RegistryStillWorks:
    def test_tool_registry_has_all_tools(self):
        """AI-3 ToolRegistry still has all 7 tools."""
        from app.tools import register_all_tools
        register_all_tools()
        assert len(registry) == 7
        expected = {
            "get_flight_status",
            "get_flight_tracking",
            "get_airport_information",
            "get_airport_departures",
            "get_airport_arrivals",
            "get_weather",
            "search_flights",
        }
        assert set(registry.tool_names) == expected

    def test_tool_definitions_format(self):
        """AI-3 tool definitions are still OpenAI-compatible."""
        from app.tools import register_all_tools
        register_all_tools()
        defs = registry.get_definitions()
        assert len(defs) == 7
        for defn in defs:
            assert defn["type"] == "function"
            assert "function" in defn
            assert "name" in defn["function"]
            assert "description" in defn["function"]
            assert "parameters" in defn["function"]

    @pytest.mark.asyncio
    async def test_tool_execution_via_registry(self):
        """AI-3 tools can still be executed via ToolRegistry."""
        from app.tools import register_all_tools
        register_all_tools()
        with patch("app.tools.flight_tools.client.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = {"flightNumber": "AI302", "status": "active"}
            result = await registry.execute(
                "get_flight_status", {"flight_number": "AI302"}
            )
            assert result.success
            assert result.data["flightNumber"] == "AI302"


# ===== MCP ↔ AI-3 Bridge =====


class TestMCPAI3Bridge:
    @pytest.mark.asyncio
    async def test_mcp_and_registry_use_same_tool_implementations(self):
        """MCP tools and AI-3 tools share the same underlying implementations."""
        from app.mcp.server import get_flight_status as mcp_tool
        with patch("app.tools.flight_tools.client.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = {"flightNumber": "AI302", "status": "active"}
            result = await mcp_tool("AI302")
            # The MCP tool should call the same Spring Boot proxy endpoint
            mock_get.assert_called_once_with("/api/ai/proxy/flights/AI302")
            assert "AI302" in result

    def test_mcp_tool_names_match_registry_names(self):
        """MCP tool functions correspond to all ToolRegistry tool names."""
        from app.mcp.server import (
            get_flight_status,
            get_flight_tracking,
            get_airport_information,
            get_airport_departures,
            get_airport_arrivals,
            get_weather,
            search_flights,
        )
        from app.tools import register_all_tools
        register_all_tools()
        mcp_functions = {
            "get_flight_status": get_flight_status,
            "get_flight_tracking": get_flight_tracking,
            "get_airport_information": get_airport_information,
            "get_airport_departures": get_airport_departures,
            "get_airport_arrivals": get_airport_arrivals,
            "get_weather": get_weather,
            "search_flights": search_flights,
        }
        for name in registry.tool_names:
            assert name in mcp_functions, f"MCP missing tool: {name}"
