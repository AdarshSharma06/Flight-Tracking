"""Flight tools — status and tracking via Spring Boot."""

from typing import Any

from app.tools.base import Tool, ToolResult
from app.tools import client


class GetFlightStatusTool(Tool):
    """Retrieve flight status and details."""

    @property
    def name(self) -> str:
        return "get_flight_status"

    @property
    def description(self) -> str:
        return (
            "Get current status and details for a specific flight. "
            "Returns flight information including departure/arrival airports, "
            "times, delays, airline, and aircraft details."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "flight_number": {
                    "type": "string",
                    "description": "Flight IATA code (e.g., 'AI302', '6E101', 'BA142')",
                },
            },
            "required": ["flight_number"],
        }

    async def execute(self, flight_number: str = "", **kwargs) -> ToolResult:
        flight_number = flight_number.strip().upper()
        if not flight_number:
            return ToolResult(success=False, error="flight_number is required")

        data = await client.get(f"/api/ai/proxy/flights/{flight_number}")

        if "error" in data:
            return ToolResult(success=False, error=data["error"])

        return ToolResult(success=True, data=data)


class GetFlightTrackingTool(Tool):
    """Retrieve current tracking/position information for a flight."""

    @property
    def name(self) -> str:
        return "get_flight_tracking"

    @property
    def description(self) -> str:
        return (
            "Get current tracking information for a flight including live position "
            "(latitude, longitude, altitude, speed) if available. "
            "Note: live position data may not always be available."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "flight_number": {
                    "type": "string",
                    "description": "Flight IATA code (e.g., 'AI302', '6E101')",
                },
            },
            "required": ["flight_number"],
        }

    async def execute(self, flight_number: str = "", **kwargs) -> ToolResult:
        flight_number = flight_number.strip().upper()
        if not flight_number:
            return ToolResult(success=False, error="flight_number is required")

        data = await client.get(f"/api/ai/proxy/flights/{flight_number}/tracking")

        if "error" in data:
            return ToolResult(success=False, error=data["error"])

        # Check if live data is available
        has_live = (
            data.get("latitude") is not None
            and data.get("longitude") is not None
        )
        data["live_data_available"] = has_live

        return ToolResult(success=True, data=data)
