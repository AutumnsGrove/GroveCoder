"""Tests for grove_coder.server."""

import json
from unittest.mock import AsyncMock, patch

import pytest

from grove_coder.server import GroveCoderServer, _build_tool_list


@pytest.fixture
def server(tmp_path):
    """Create a GroveCoderServer with test config."""
    secrets = {
        "openrouter_api_key": "sk-or-v1-test",
        "worker_model": "deepseek/deepseek-v3.2",
        "zdr_enabled": True,
        "preferred_providers": ["Together"],
        "cost_limits": {"daily_usd": 10.0, "monthly_usd": 50.0},
    }
    return GroveCoderServer(secrets=secrets, db_path=str(tmp_path / "test.db"))


def test_build_tool_list():
    """Tool list contains all 4 expected tools."""
    tools = _build_tool_list()
    names = {t.name for t in tools}
    assert names == {"generate_code", "edit_code", "review_code", "get_cost_report"}


def test_build_tool_list_schemas():
    """Each tool has required fields in its schema."""
    tools = _build_tool_list()
    for tool in tools:
        assert tool.inputSchema["type"] == "object"
        assert "properties" in tool.inputSchema
        assert "required" in tool.inputSchema


@pytest.mark.asyncio
async def test_handle_unknown_tool(server):
    """Unknown tool names return an error."""
    result = await server._handle_tool_call("nonexistent", {})
    data = json.loads(result[0].text)
    assert "error" in data
    assert "nonexistent" in data["error"]


@pytest.mark.asyncio
async def test_handle_cost_report_empty(server):
    """Cost report on empty DB returns zeros."""
    result = await server._handle_tool_call("get_cost_report", {"period": "all"})
    data = json.loads(result[0].text)
    assert data["total_requests"] == 0
    assert data["total_cost_usd"] == 0.0


@pytest.mark.asyncio
async def test_handle_cost_report_with_data(server):
    """Cost report returns aggregated data."""
    server.db.log_request("generate_code", 0.01, {"input": 1000, "output": 500})
    server.db.log_request("edit_code", 0.005, {"input": 300, "output": 150})

    result = await server._handle_tool_call("get_cost_report", {"period": "all"})
    data = json.loads(result[0].text)
    assert data["total_requests"] == 2


@pytest.mark.asyncio
async def test_daily_cost_limit_blocks_request(server):
    """Requests are blocked when daily cost limit is exceeded."""
    server.db.log_request("generate_code", 15.0, {"input": 1000, "output": 500})

    result = await server._handle_deepseek_call("generate_code", {"task_description": "test", "language": "python"})
    data = json.loads(result[0].text)
    assert data["error"] == "Daily cost limit exceeded"


@pytest.mark.asyncio
async def test_monthly_cost_limit_blocks_request(server):
    """Requests are blocked when monthly cost limit is exceeded."""
    server.db.log_request("generate_code", 55.0, {"input": 1000, "output": 500})

    result = await server._handle_deepseek_call("generate_code", {"task_description": "test", "language": "python"})
    data = json.loads(result[0].text)
    assert "cost limit exceeded" in data["error"]


@pytest.mark.asyncio
async def test_deepseek_error_returns_error_json(server):
    """DeepSeek errors are caught and returned as error JSON."""
    with patch.object(
        server.deepseek, "call", new_callable=AsyncMock, side_effect=RuntimeError("API down")
    ):
        result = await server._handle_deepseek_call(
            "generate_code", {"task_description": "test", "language": "python"}
        )
    data = json.loads(result[0].text)
    assert "error" in data
    assert "API down" in data["error"]


@pytest.mark.asyncio
async def test_successful_deepseek_call_logs_request(server):
    """Successful calls are logged to the database."""
    mock_result = {
        "code": "print('hi')",
        "explanation": "greeting",
        "suggestions": [],
        "cost_usd": 0.001,
        "tokens_used": {"input": 100, "output": 50},
    }

    with patch.object(server.deepseek, "call", new_callable=AsyncMock, return_value=mock_result):
        await server._handle_deepseek_call(
            "generate_code", {"task_description": "greet", "language": "python"}
        )

    report = server.db.get_report("all")
    assert report["total_requests"] == 1
    assert abs(report["total_cost_usd"] - 0.001) < 1e-6


@pytest.mark.asyncio
async def test_cleanup_closes_deepseek(server):
    """Cleanup closes the DeepSeek client."""
    with patch.object(server.deepseek, "close", new_callable=AsyncMock) as mock_close:
        await server.cleanup()
        mock_close.assert_called_once()
