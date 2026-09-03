"""Flight search tool — search flights via Spring Boot."""

from typing import Any

from app.tools.base import Tool, ToolResult
from app.tools import client


class SearchFlightsTool(Tool):
    """Search for flights by various criteria."""

    @property
    def name(self) -> str:
        return "search_flights"

    @property
    def description(self) -> str:
        return (
            "Search for flights by route, airline, or status. "
            "Can search by departure/arrival airports, flight number, "
            "airline, or flight status. Returns a list of matching flights."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "flight_iata": {
                    "type": "string",
                    "description": "Flight IATA code to search for (e.g., 'AI302')",
                },
                "dep_iata": {
                    "type": "string",
                    "description": "Departure airport IATA code (e.g., 'DEL')",
                },
                "arr_iata": {
                    "type": "string",
                    "description": "Arrival airport IATA code (e.g., 'BOM')",
                },
                "airline_iata": {
                    "type": "string",
                    "description": "Airline IATA code (e.g., 'AI' for Air India)",
                },
                "flight_status": {
                    "type": "string",
                    "description": "Flight status filter (e.g., 'active', 'cancelled', 'landed', 'scheduled')",
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of results (1-100, default 10)",
                    "default": 10,
                },
            },
            "required": [],
        }

    async def execute(
        self,
        flight_iata: str = "",
        dep_iata: str = "",
        arr_iata: str = "",
        airline_iata: str = "",
        flight_status: str = "",
        limit: int = 10,
        **kwargs,
    ) -> ToolResult:
        params: dict[str, Any] = {}
        if flight_iata:
            params["flight_iata"] = flight_iata.strip().upper()
        if dep_iata:
            params["dep_iata"] = dep_iata.strip().upper()
        if arr_iata:
            params["arr_iata"] = arr_iata.strip().upper()
        if airline_iata:
            params["airline_iata"] = airline_iata.strip().upper()
        if flight_status:
            params["flight_status"] = flight_status.strip().lower()

        params["limit"] = max(1, min(100, limit))

        if not params.get("flight_iata") and not params.get("dep_iata") and not params.get("arr_iata"):
            return ToolResult(
                success=False,
                error="At least one of flight_iata, dep_iata, or arr_iata must be provided",
            )

        data = await client.get("/api/ai/proxy/flights/search", params=params)

        if "error" in data:
            return ToolResult(success=False, error=data["error"])

        return ToolResult(success=True, data=data)
