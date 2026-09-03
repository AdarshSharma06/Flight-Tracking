"""Weather tool — airport weather via Spring Boot."""

from typing import Any

from app.tools.base import Tool, ToolResult
from app.tools import client


class GetWeatherTool(Tool):
    """Retrieve current weather at an airport."""

    @property
    def name(self) -> str:
        return "get_weather"

    @property
    def description(self) -> str:
        return (
            "Get current weather conditions at an airport. "
            "Returns temperature, humidity, wind speed, and weather condition."
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

        data = await client.get(f"/api/ai/proxy/weather/airport/{iata}")

        if "error" in data:
            return ToolResult(success=False, error=data["error"])

        return ToolResult(success=True, data=data)
