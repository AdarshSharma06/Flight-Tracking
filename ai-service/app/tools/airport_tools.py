"""Airport tools — information, departures, arrivals via Spring Boot."""

from typing import Any

from app.tools.base import Tool, ToolResult
from app.tools import client


class GetAirportInformationTool(Tool):
    """Retrieve airport details."""

    @property
    def name(self) -> str:
        return "get_airport_information"

    @property
    def description(self) -> str:
        return (
            "Get information about an airport including name, city, country, "
            "coordinates, and timezone. Use IATA code (e.g., DEL, JFK, BOM)."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "iata": {
                    "type": "string",
                    "description": "3-letter IATA airport code (e.g., 'DEL', 'JFK', 'BOM')",
                },
            },
            "required": ["iata"],
        }

    async def execute(self, iata: str = "", **kwargs) -> ToolResult:
        iata = iata.strip().upper()
        if not iata or len(iata) != 3:
            return ToolResult(success=False, error="iata must be a 3-letter code")

        data = await client.get(f"/api/ai/proxy/airports/{iata}")

        if "error" in data:
            return ToolResult(success=False, error=data["error"])

        return ToolResult(success=True, data=data)


class GetAirportDeparturesTool(Tool):
    """Retrieve flights departing from an airport."""

    @property
    def name(self) -> str:
        return "get_airport_departures"

    @property
    def description(self) -> str:
        return (
            "Get flights currently departing from an airport. "
            "Returns a list of departing flights with their details."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "iata": {
                    "type": "string",
                    "description": "3-letter IATA airport code (e.g., 'DEL', 'JFK')",
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of results (1-100, default 10)",
                    "default": 10,
                },
            },
            "required": ["iata"],
        }

    async def execute(self, iata: str = "", limit: int = 10, **kwargs) -> ToolResult:
        iata = iata.strip().upper()
        if not iata or len(iata) != 3:
            return ToolResult(success=False, error="iata must be a 3-letter code")

        limit = max(1, min(100, limit))
        data = await client.get(
            f"/api/ai/proxy/airports/{iata}/departures",
            params={"limit": limit},
        )

        if "error" in data:
            return ToolResult(success=False, error=data["error"])

        return ToolResult(success=True, data=data)


class GetAirportArrivalsTool(Tool):
    """Retrieve flights arriving at an airport."""

    @property
    def name(self) -> str:
        return "get_airport_arrivals"

    @property
    def description(self) -> str:
        return (
            "Get flights currently arriving at an airport. "
            "Returns a list of arriving flights with their details."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "iata": {
                    "type": "string",
                    "description": "3-letter IATA airport code (e.g., 'DEL', 'JFK')",
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of results (1-100, default 10)",
                    "default": 10,
                },
            },
            "required": ["iata"],
        }

    async def execute(self, iata: str = "", limit: int = 10, **kwargs) -> ToolResult:
        iata = iata.strip().upper()
        if not iata or len(iata) != 3:
            return ToolResult(success=False, error="iata must be a 3-letter code")

        limit = max(1, min(100, limit))
        data = await client.get(
            f"/api/ai/proxy/airports/{iata}/arrivals",
            params={"limit": limit},
        )

        if "error" in data:
            return ToolResult(success=False, error=data["error"])

        return ToolResult(success=True, data=data)
