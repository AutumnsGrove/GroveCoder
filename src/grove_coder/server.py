"""MCP server implementation for grove-coder."""

import asyncio
import json
import logging

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import TextContent, Tool

from .config import load_secrets
from .database import CostDatabase
from .deepseek import DeepSeekClient

logger = logging.getLogger("grove-coder")


def _build_tool_list() -> list[Tool]:
    """Define the MCP tools exposed by this server."""
    return [
        Tool(
            name="generate_code",
            description="Generate new code using DeepSeek specialist",
            inputSchema={
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Target file path (for context)",
                    },
                    "task_description": {
                        "type": "string",
                        "description": "What to build",
                    },
                    "language": {
                        "type": "string",
                        "description": "Programming language (python, typescript, etc.)",
                    },
                    "context": {
                        "type": "string",
                        "description": "Optional surrounding code or documentation",
                    },
                },
                "required": ["task_description", "language"],
            },
        ),
        Tool(
            name="edit_code",
            description="Edit existing code using DeepSeek specialist",
            inputSchema={
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Path to the file being edited",
                    },
                    "original_code": {
                        "type": "string",
                        "description": "Current code block to modify",
                    },
                    "change_request": {
                        "type": "string",
                        "description": "What to change",
                    },
                    "language": {
                        "type": "string",
                        "description": "Programming language",
                    },
                },
                "required": ["original_code", "change_request", "language"],
            },
        ),
        Tool(
            name="review_code",
            description="Review code for issues using DeepSeek reasoning mode",
            inputSchema={
                "type": "object",
                "properties": {
                    "code": {
                        "type": "string",
                        "description": "Code to review",
                    },
                    "focus_areas": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Areas to focus on (performance, security, readability)",
                    },
                },
                "required": ["code"],
            },
        ),
        Tool(
            name="get_cost_report",
            description="Query cost tracking database",
            inputSchema={
                "type": "object",
                "properties": {
                    "period": {
                        "type": "string",
                        "enum": ["today", "week", "month", "all"],
                        "description": "Time period for the report",
                    },
                    "tool": {
                        "type": "string",
                        "description": "Filter by tool name (optional)",
                    },
                },
                "required": ["period"],
            },
        ),
    ]


class GroveCoderServer:
    """MCP server that bridges orchestrator models to DeepSeek coding specialist."""

    def __init__(self, secrets: dict | None = None, db_path: str = "grove_coder.db"):
        self.secrets = secrets or load_secrets()
        self.deepseek = DeepSeekClient(self.secrets)
        self.db = CostDatabase(db_path)
        self.server = Server("grove-coder")
        self._register_handlers()

    def _register_handlers(self) -> None:
        """Register MCP tool handlers on the server."""

        @self.server.list_tools()
        async def list_tools() -> list[Tool]:
            return _build_tool_list()

        @self.server.call_tool()
        async def call_tool(name: str, arguments: dict) -> list[TextContent]:
            return await self._handle_tool_call(name, arguments)

    async def _handle_tool_call(
        self, name: str, arguments: dict
    ) -> list[TextContent]:
        """Route a tool call to the appropriate handler."""
        if name in ("generate_code", "edit_code", "review_code"):
            return await self._handle_deepseek_call(name, arguments)
        elif name == "get_cost_report":
            return self._handle_cost_report(arguments)
        else:
            return [
                TextContent(
                    type="text",
                    text=json.dumps({"error": f"Unknown tool: {name}"}),
                )
            ]

    async def _handle_deepseek_call(
        self, tool_name: str, arguments: dict
    ) -> list[TextContent]:
        """Handle a code generation/edit/review request via DeepSeek."""
        # Check cost limits before making the request
        cost_limits = self.secrets.get("cost_limits", {})
        daily_limit = cost_limits.get("daily_usd", 10.0)
        monthly_limit = cost_limits.get("monthly_usd", 50.0)

        if not self.db.check_cost_limit("today", daily_limit):
            return [
                TextContent(
                    type="text",
                    text=json.dumps({
                        "error": "Daily cost limit exceeded",
                        "limit_usd": daily_limit,
                    }),
                )
            ]

        if not self.db.check_cost_limit("month", monthly_limit):
            return [
                TextContent(
                    type="text",
                    text=json.dumps({
                        "error": "Monthly cost limit exceeded",
                        "limit_usd": monthly_limit,
                    }),
                )
            ]

        try:
            result = await self.deepseek.call(arguments, tool_name)
        except (ValueError, RuntimeError) as e:
            logger.error("DeepSeek call failed for %s: %s", tool_name, e)
            return [
                TextContent(
                    type="text",
                    text=json.dumps({"error": str(e)}),
                )
            ]

        # Log the request
        self.db.log_request(
            tool_name,
            result["cost_usd"],
            result["tokens_used"],
            file_path=arguments.get("file_path"),
        )

        return [TextContent(type="text", text=json.dumps(result))]

    def _handle_cost_report(self, arguments: dict) -> list[TextContent]:
        """Handle a cost report query."""
        period = arguments.get("period", "today")
        tool_filter = arguments.get("tool")
        report = self.db.get_report(period, tool_filter)
        return [TextContent(type="text", text=json.dumps(report))]

    async def cleanup(self) -> None:
        """Clean up resources."""
        await self.deepseek.close()


async def _run_server() -> None:
    """Run the MCP server over stdio."""
    secrets = load_secrets()
    grove = GroveCoderServer(secrets)

    try:
        async with stdio_server() as (read_stream, write_stream):
            await grove.server.run(
                read_stream,
                write_stream,
                grove.server.create_initialization_options(),
            )
    finally:
        await grove.cleanup()


def main() -> None:
    """Entry point for the grove-coder MCP server."""
    logging.basicConfig(level=logging.INFO)
    asyncio.run(_run_server())


if __name__ == "__main__":
    main()
