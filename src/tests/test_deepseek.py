"""Tests for grove_coder.deepseek."""

import json
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from grove_coder.deepseek import MAX_CODE_LENGTH, MAX_DESCRIPTION_LENGTH, DeepSeekClient


@pytest.fixture
def client():
    """Create a DeepSeekClient with test secrets."""
    return DeepSeekClient({
        "openrouter_api_key": "sk-or-v1-test",
        "worker_model": "deepseek/deepseek-v3.2",
        "zdr_enabled": True,
        "preferred_providers": ["Together"],
    })


def test_init_requires_api_key():
    """Client raises ValueError if API key is missing."""
    with pytest.raises(ValueError, match="openrouter_api_key is required"):
        DeepSeekClient({})


def test_init_with_valid_secrets(client):
    """Client initializes with correct settings."""
    assert client.model == "deepseek/deepseek-v3.2"
    assert client.zdr is True
    assert client.providers == ["Together"]


def test_calculate_cost(client):
    """Cost calculation matches DeepSeek pricing."""
    usage = {"prompt_tokens": 1_000_000, "completion_tokens": 1_000_000}
    cost = client._calculate_cost(usage)
    # Input: $0.28/M + Output: $0.42/M = $0.70
    assert abs(cost - 0.70) < 1e-6


def test_calculate_cost_zero(client):
    """Zero tokens = zero cost."""
    assert client._calculate_cost({}) == 0.0


def test_get_system_prompt_generate(client):
    """Generate prompt includes the language."""
    prompt = client._get_system_prompt("generate_code", {"language": "rust"})
    assert "rust" in prompt
    assert "code generation specialist" in prompt


def test_get_system_prompt_edit(client):
    """Edit prompt is returned for edit_code."""
    prompt = client._get_system_prompt("edit_code", {})
    assert "code editing specialist" in prompt


def test_get_system_prompt_review(client):
    """Review prompt includes focus areas."""
    prompt = client._get_system_prompt("review_code", {"focus_areas": ["security"]})
    assert "security" in prompt


def test_build_user_prompt_generate(client):
    """Generate user prompt includes task and language."""
    prompt = client._build_user_prompt(
        {"task_description": "Build a parser", "language": "python"},
        "generate_code",
    )
    assert "Build a parser" in prompt
    assert "python" in prompt


def test_build_user_prompt_edit(client):
    """Edit user prompt includes original code and change request."""
    prompt = client._build_user_prompt(
        {"original_code": "def foo(): pass", "change_request": "Add docstring", "language": "python"},
        "edit_code",
    )
    assert "def foo(): pass" in prompt
    assert "Add docstring" in prompt


def test_build_user_prompt_review(client):
    """Review user prompt includes code."""
    prompt = client._build_user_prompt({"code": "x = 1"}, "review_code")
    assert "x = 1" in prompt


def test_validate_inputs_code_too_long(client):
    """Raises ValueError when code exceeds max length."""
    with pytest.raises(ValueError, match="exceeds maximum length"):
        client._validate_inputs({"code": "x" * (MAX_CODE_LENGTH + 1)}, "review_code")


def test_validate_inputs_description_too_long(client):
    """Raises ValueError when task description exceeds max length."""
    with pytest.raises(ValueError, match="exceeds maximum length"):
        client._validate_inputs(
            {"task_description": "x" * (MAX_DESCRIPTION_LENGTH + 1)},
            "generate_code",
        )


def test_validate_inputs_within_limits(client):
    """No error when inputs are within limits."""
    client._validate_inputs({"code": "x" * 100}, "review_code")


@pytest.mark.asyncio
async def test_call_success(client):
    """Successful API call returns structured result."""
    mock_response = httpx.Response(
        200,
        json={
            "choices": [{"message": {"content": json.dumps({"code": "print('hi')", "explanation": "A greeting"})}}],
            "usage": {"prompt_tokens": 100, "completion_tokens": 50},
        },
        request=httpx.Request("POST", "https://test.com"),
    )

    with patch.object(client._client, "post", new_callable=AsyncMock, return_value=mock_response):
        result = await client.call({"task_description": "hello", "language": "python"}, "generate_code")

    assert result["code"] == "print('hi')"
    assert result["explanation"] == "A greeting"
    assert result["tokens_used"]["input"] == 100
    assert result["tokens_used"]["output"] == 50
    assert result["cost_usd"] > 0


@pytest.mark.asyncio
async def test_call_api_error(client):
    """API errors are wrapped in RuntimeError."""
    mock_response = httpx.Response(
        500,
        text="Internal Server Error",
        request=httpx.Request("POST", "https://test.com"),
    )

    with patch.object(client._client, "post", new_callable=AsyncMock, return_value=mock_response):
        with pytest.raises(RuntimeError, match="OpenRouter API returned 500"):
            await client.call({"task_description": "hello", "language": "python"}, "generate_code")


@pytest.mark.asyncio
async def test_call_malformed_json(client):
    """Malformed JSON response raises RuntimeError."""
    mock_response = httpx.Response(
        200,
        json={"choices": [{"message": {"content": "not valid json"}}]},
        request=httpx.Request("POST", "https://test.com"),
    )

    with patch.object(client._client, "post", new_callable=AsyncMock, return_value=mock_response):
        with pytest.raises(RuntimeError, match="unparseable response"):
            await client.call({"task_description": "hello", "language": "python"}, "generate_code")


@pytest.mark.asyncio
async def test_close(client):
    """Client close calls aclose on the HTTP client."""
    with patch.object(client._client, "aclose", new_callable=AsyncMock) as mock_close:
        await client.close()
        mock_close.assert_called_once()
