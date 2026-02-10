"""DeepSeek API client via OpenRouter for grove-coder."""

import json
import logging
from typing import Any

import httpx

logger = logging.getLogger("grove-coder")

# Max input sizes to prevent abuse and runaway costs
MAX_CODE_LENGTH = 100_000  # ~100K chars
MAX_DESCRIPTION_LENGTH = 10_000


# System prompts per tool
_GENERATE_SYSTEM_PROMPT = """\
You are a code generation specialist. Write clean, working code.

RULES:
1. Return ONLY a JSON object with keys "code" and "explanation"
2. Code must be complete, runnable, and follow best practices for {language}
3. Explanation must be brief (1-2 sentences) describing key decisions
4. No markdown formatting, no code fences, no prose outside JSON
5. If unsure, make reasonable assumptions and document in explanation

OUTPUT FORMAT:
{{"code": "...", "explanation": "..."}}"""

_EDIT_SYSTEM_PROMPT = """\
You are a code editing specialist. Modify existing code as requested.

RULES:
1. Return ONLY a JSON object with keys "code" and "explanation"
2. The "code" field must contain the complete modified code
3. Preserve the original code's style and conventions
4. Explanation must be brief (1-2 sentences) describing what changed
5. No markdown formatting, no code fences, no prose outside JSON

OUTPUT FORMAT:
{{"code": "...", "explanation": "..."}}"""

_REVIEW_SYSTEM_PROMPT = """\
You are a code reviewer. Analyze the provided code for issues.

Focus areas: {focus_areas}

Return JSON with:
- "code": (original code unchanged)
- "explanation": summary of findings
- "suggestions": array of specific improvements"""


class DeepSeekClient:
    """Async client for DeepSeek models via OpenRouter API."""

    BASE_URL = "https://openrouter.ai/api/v1"

    def __init__(self, secrets: dict[str, Any]):
        api_key = secrets.get("openrouter_api_key")
        if not api_key:
            raise ValueError("openrouter_api_key is required in secrets")

        self.api_key = api_key
        self.model = secrets.get("worker_model", "deepseek/deepseek-v3.2")
        self.zdr = secrets.get("zdr_enabled", True)
        self.providers = secrets.get("preferred_providers", [])
        self._client = httpx.AsyncClient(
            base_url=self.BASE_URL,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "X-Title": "grove-coder",
            },
            timeout=120.0,
        )

    async def close(self) -> None:
        """Close the underlying HTTP client."""
        await self._client.aclose()

    async def call(self, arguments: dict[str, Any], tool_name: str) -> dict[str, Any]:
        """Send a request to DeepSeek via OpenRouter and return structured results."""
        self._validate_inputs(arguments, tool_name)

        system_prompt = self._get_system_prompt(tool_name, arguments)
        user_prompt = self._build_user_prompt(arguments, tool_name)

        payload: dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "response_format": {"type": "json_object"},
            "provider": {
                "order": self.providers,
                "require_zdr": self.zdr,
            },
        }

        # Enable reasoning mode for code review
        if tool_name == "review_code":
            payload["reasoning"] = True

        try:
            response = await self._client.post("/chat/completions", json=payload)
            response.raise_for_status()
        except httpx.HTTPStatusError as e:
            logger.error("OpenRouter API error: %s %s", e.response.status_code, e.response.text[:200])
            raise RuntimeError(f"OpenRouter API returned {e.response.status_code}") from e
        except httpx.RequestError as e:
            logger.error("Network error calling OpenRouter: %s", e)
            raise RuntimeError("Failed to connect to OpenRouter API") from e

        data = response.json()

        try:
            raw_content = data["choices"][0]["message"]["content"]
            content = json.loads(raw_content)
        except (KeyError, IndexError, json.JSONDecodeError) as e:
            logger.error("Malformed response from DeepSeek: %s", e)
            raise RuntimeError("DeepSeek returned an unparseable response") from e

        usage = data.get("usage", {})
        cost = self._calculate_cost(usage)

        return {
            "code": content.get("code", ""),
            "explanation": content.get("explanation", ""),
            "suggestions": content.get("suggestions", []),
            "cost_usd": cost,
            "tokens_used": {
                "input": usage.get("prompt_tokens", 0),
                "output": usage.get("completion_tokens", 0),
            },
        }

    def _validate_inputs(self, arguments: dict[str, Any], tool_name: str) -> None:
        """Validate input sizes to prevent abuse and runaway costs."""
        for key in ("code", "original_code", "context"):
            value = arguments.get(key, "")
            if value and len(value) > MAX_CODE_LENGTH:
                raise ValueError(f"{key} exceeds maximum length of {MAX_CODE_LENGTH} characters")

        for key in ("task_description", "change_request"):
            value = arguments.get(key, "")
            if value and len(value) > MAX_DESCRIPTION_LENGTH:
                raise ValueError(f"{key} exceeds maximum length of {MAX_DESCRIPTION_LENGTH} characters")

    def _get_system_prompt(self, tool_name: str, arguments: dict[str, Any]) -> str:
        """Return the appropriate system prompt for the tool."""
        if tool_name == "generate_code":
            language = arguments.get("language", "python")
            return _GENERATE_SYSTEM_PROMPT.format(language=language)
        elif tool_name == "edit_code":
            return _EDIT_SYSTEM_PROMPT
        elif tool_name == "review_code":
            focus = arguments.get("focus_areas", ["performance", "security", "readability"])
            return _REVIEW_SYSTEM_PROMPT.format(focus_areas=", ".join(focus))
        else:
            return "You are a helpful coding assistant."

    def _build_user_prompt(self, arguments: dict[str, Any], tool_name: str) -> str:
        """Build the user prompt from tool arguments."""
        if tool_name == "generate_code":
            parts = [f"Task: {arguments['task_description']}"]
            parts.append(f"Language: {arguments.get('language', 'python')}")
            if arguments.get("file_path"):
                parts.append(f"Target file: {arguments['file_path']}")
            if arguments.get("context"):
                parts.append(f"Context:\n{arguments['context']}")
            return "\n".join(parts)

        elif tool_name == "edit_code":
            parts = [f"Original code:\n```\n{arguments['original_code']}\n```"]
            parts.append(f"Change request: {arguments['change_request']}")
            parts.append(f"Language: {arguments.get('language', 'python')}")
            if arguments.get("file_path"):
                parts.append(f"File: {arguments['file_path']}")
            return "\n".join(parts)

        elif tool_name == "review_code":
            parts = [f"Code to review:\n```\n{arguments['code']}\n```"]
            if arguments.get("focus_areas"):
                parts.append(f"Focus on: {', '.join(arguments['focus_areas'])}")
            return "\n".join(parts)

        return json.dumps(arguments)

    def _calculate_cost(self, usage: dict[str, Any]) -> float:
        """Calculate request cost based on DeepSeek V3.2 pricing via OpenRouter.

        Pricing: Input $0.25/M tokens, Output $0.38/M tokens.
        """
        input_tokens = usage.get("prompt_tokens", 0)
        output_tokens = usage.get("completion_tokens", 0)

        input_cost = (input_tokens / 1_000_000) * 0.25
        output_cost = (output_tokens / 1_000_000) * 0.38

        return round(input_cost + output_cost, 6)
