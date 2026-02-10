"""Configuration and secrets loader for grove-coder."""

import json
import os
from pathlib import Path
from typing import Any

# Default configuration values
DEFAULTS = {
    "orchestrator_model": "minimax/minimax-m2",
    "worker_model": "deepseek/deepseek-v3.2",
    "zdr_enabled": True,
    "preferred_providers": ["Together", "Fireworks"],
    "cost_limits": {
        "daily_usd": 10.0,
        "monthly_usd": 50.0,
    },
}


def load_secrets(secrets_path: str | Path | None = None) -> dict[str, Any]:
    """Load secrets from secrets.json or environment variables.

    Lookup order:
    1. Environment variables (highest priority)
    2. secrets.json file
    3. Built-in defaults (for non-sensitive values only)
    """
    if secrets_path is None:
        secrets_path = Path("secrets.json")
    else:
        secrets_path = Path(secrets_path)

    # Load from file if it exists
    if secrets_path.exists():
        with open(secrets_path) as f:
            secrets = json.load(f)
    else:
        secrets = {}

    # Environment variables override file values
    env_key = os.getenv("OPENROUTER_API_KEY")
    if env_key:
        secrets["openrouter_api_key"] = env_key

    env_model = os.getenv("GROVE_CODER_WORKER_MODEL")
    if env_model:
        secrets["worker_model"] = env_model

    # Apply defaults for non-sensitive config
    for key, default in DEFAULTS.items():
        if key not in secrets:
            secrets[key] = default

    return secrets
