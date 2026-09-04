"""Tool registry — manages available tools for the LLM."""

import logging
from typing import Any, Optional

from app.tools.base import Tool, ToolResult

logger = logging.getLogger(__name__)


class ToolRegistry:
    """Registry of tools available to the LLM."""

    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        """Register a tool."""
        if tool.name in self._tools:
            logger.warning("Overwriting existing tool: %s", tool.name)
        self._tools[tool.name] = tool
        logger.info("Registered tool: %s", tool.name)

    def get(self, name: str) -> Optional[Tool]:
        """Get a tool by name."""
        return self._tools.get(name)

    def get_definitions(self) -> list[dict[str, Any]]:
        """Get OpenAI-compatible tool definitions for all registered tools."""
        return [tool.get_definition() for tool in self._tools.values()]

    async def execute(self, name: str, arguments: dict[str, Any]) -> ToolResult:
        """Execute a tool by name with the given arguments."""
        from app.observability.context import get_request_id
        from app.observability import tracer
        request_id = get_request_id() or "unknown"
        start = tracer.start_timer()
        tracer.record_tool_started(request_id, name)

        tool = self._tools.get(name)
        if not tool:
            duration_ms = tracer.elapsed_ms(start)
            tracer.record_tool_failed(request_id, name, duration_ms, error_category="unknown_tool")
            return ToolResult(
                success=False,
                error=f"Unknown tool: {name}. Available tools: {', '.join(self._tools.keys())}",
            )

        validation_error = tool.validate_args(arguments)
        if validation_error:
            duration_ms = tracer.elapsed_ms(start)
            tracer.record_tool_failed(request_id, name, duration_ms, error_category="validation_error")
            return ToolResult(success=False, error=validation_error)

        try:
            logger.info("Executing tool: %s with args: %s", name, arguments)
            result = await tool.execute(**arguments)
            duration_ms = tracer.elapsed_ms(start)
            logger.info("Tool %s completed: success=%s", name, result.success)
            # Do not log huge payloads; record metadata only
            result_size = len(str(result.data)) if result.data is not None else 0
            tracer.record_tool_completed(request_id, name, duration_ms, success=result.success, result_size=result_size, status="success" if result.success else "failure")
            return result
        except Exception as e:
            duration_ms = tracer.elapsed_ms(start)
            logger.exception("Tool %s execution failed", name)
            tracer.record_tool_failed(request_id, name, duration_ms, error_category="execution_exception")
            return ToolResult(success=False, error=f"Tool execution failed: {e}")

    @property
    def tool_names(self) -> list[str]:
        return list(self._tools.keys())

    def __len__(self) -> int:
        return len(self._tools)


# Global registry instance
registry = ToolRegistry()
