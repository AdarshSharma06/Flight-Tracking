"""Tool abstraction for LLM tool calling."""

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional

logger = logging.getLogger(__name__)


@dataclass
class ToolResult:
    """Result of a tool execution."""
    success: bool
    data: Any = None
    error: Optional[str] = None

    def to_content(self) -> str:
        """Format result as a string for the LLM."""
        if not self.success:
            return f"Error: {self.error}" if self.error else "Tool execution failed"
        if self.data is None:
            return "No data available"
        if isinstance(self.data, str):
            return self.data
        import json
        return json.dumps(self.data, default=str, indent=2)


class Tool(ABC):
    """Base class for all tools available to the LLM."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique tool name the LLM uses to invoke this tool."""
        ...

    @property
    @abstractmethod
    def description(self) -> str:
        """Description shown to the LLM."""
        ...

    @property
    @abstractmethod
    def parameters(self) -> dict[str, Any]:
        """JSON Schema for tool parameters."""
        ...

    def get_definition(self) -> dict[str, Any]:
        """Return OpenAI-compatible tool definition."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }

    @abstractmethod
    async def execute(self, **kwargs) -> ToolResult:
        """Execute the tool with the given arguments."""
        ...

    def validate_args(self, kwargs: dict[str, Any]) -> Optional[str]:
        """Validate tool arguments. Returns error message or None if valid."""
        required = self.parameters.get("required", [])
        properties = self.parameters.get("properties", {})
        for field_name in required:
            if field_name not in kwargs:
                return f"Missing required parameter: {field_name}"
        for key in kwargs:
            if key not in properties and key != "__extra__":
                logger.warning("Unknown parameter '%s' for tool '%s'", key, self.name)
        return None
