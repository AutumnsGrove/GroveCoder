"""Tests for grove_coder.config."""

import json

import pytest

from grove_coder.config import DEFAULTS, load_secrets


@pytest.fixture
def secrets_file(tmp_path):
    """Create a temporary secrets.json file."""
    secrets = {
        "openrouter_api_key": "sk-or-v1-test-key",
        "worker_model": "deepseek/deepseek-v3.2",
        "zdr_enabled": True,
    }
    path = tmp_path / "secrets.json"
    path.write_text(json.dumps(secrets))
    return path


def test_load_from_file(secrets_file):
    """Secrets load correctly from a JSON file."""
    result = load_secrets(secrets_file)
    assert result["openrouter_api_key"] == "sk-or-v1-test-key"
    assert result["worker_model"] == "deepseek/deepseek-v3.2"
    assert result["zdr_enabled"] is True


def test_defaults_applied_when_missing(tmp_path):
    """Missing config keys get populated from DEFAULTS."""
    path = tmp_path / "secrets.json"
    path.write_text(json.dumps({"openrouter_api_key": "sk-test"}))
    result = load_secrets(path)

    assert result["preferred_providers"] == DEFAULTS["preferred_providers"]
    assert result["cost_limits"] == DEFAULTS["cost_limits"]
    assert result["worker_model"] == DEFAULTS["worker_model"]


def test_env_var_overrides_file(secrets_file, monkeypatch):
    """Environment variables take priority over file values."""
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-env-override")
    result = load_secrets(secrets_file)
    assert result["openrouter_api_key"] == "sk-env-override"


def test_env_var_worker_model(secrets_file, monkeypatch):
    """GROVE_CODER_WORKER_MODEL env var overrides file."""
    monkeypatch.setenv("GROVE_CODER_WORKER_MODEL", "qwen/qwen-coder")
    result = load_secrets(secrets_file)
    assert result["worker_model"] == "qwen/qwen-coder"


def test_missing_file_uses_defaults(tmp_path):
    """When secrets.json doesn't exist, defaults are still applied."""
    path = tmp_path / "nonexistent.json"
    result = load_secrets(path)

    assert result.get("openrouter_api_key") is None
    assert result["worker_model"] == DEFAULTS["worker_model"]
    assert result["cost_limits"] == DEFAULTS["cost_limits"]
