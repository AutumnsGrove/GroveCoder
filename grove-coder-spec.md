grove-coder
MCP Server Spec: MiniMax-to-DeepSeek Coding Bridge
Version: 1.0.0
Author: Autumn Brown (AutumnsGrove)
Stack: Python, uv, MCP SDK, SQLite, OpenRouter
----
Overview
grove-coder is an MCP server that creates a secure capability boundary between an orchestrator model (MiniMax M2.1) and a coding specialist model (DeepSeek V3.2). It enforces ZDR compliance via OpenRouter while providing cost tracking and audit logging.
----
Project Structure
grove-coder/
├── pyproject.toml          # uv project config
├── secrets.json            # API keys (gitignored)
├── src/
│   ├── grove_coder/
│   │   ├── init.py
│   │   ├── server.py       # MCP server implementation
│   │   ├── deepseek.py     # DeepSeek API client
│   │   ├── database.py     # SQLite cost tracking
│   │   └── config.py       # Secrets loader
│   └── tests/
├── grove_coder.db          # SQLite database (auto-created)
└── README.md
----
Configuration (secrets.json)
{
  "openrouter_api_key": "sk-or-v1-...",
  "orchestrator_model": "minimax/minimax-m2",
  "worker_model": "deepseek/deepseek-v3.2",
  "zdr_enabled": true,
  "preferred_providers": ["Together", "Fireworks"],
  "cost_limits": {
    "daily_usd": 10.0,
    "monthly_usd": 50.0
  }
}

----
MCP Tools Exposed
1. generate_code
Generate new code from scratch.
Input Schema:
{
  "file_path": "string",        // Target file path (for context)
  "task_description": "string", // What to build
  "language": "string",         // python, typescript, etc.
  "context": "string?"          // Optional surrounding code/docs
}

Output Schema:
{
  "code": "string",             // The generated code
  "explanation": "string",      // Why it was built this way
  "cost_usd": "float",          // Cost of this request
  "tokens_used": {
    "input": "int",
    "output": "int"
  }
}

2. edit_code
Modify existing code.
Input Schema:
{
  "file_path": "string",
  "original_code": "string",    // Current code block
  "change_request": "string",   // What to change
  "language": "string"
}

Output Schema:
Same as generate_code.
3. review_code
Analyze code for issues (uses DeepSeek reasoning mode).
Input Schema:
{
  "code": "string",
  "focus_areas": ["performance", "security", "readability"]?
}

Output Schema:
{
  "code": "string",             // Original code (unchanged)
  "explanation": "string",      // Review findings
  "suggestions": ["string"],    // List of improvements
  "cost_usd": "float"
}

4. get_cost_report
Query cost database.
Input Schema:
{
  "period": "today" | "week" | "month" | "all",
  "tool": "string?"             // Filter by tool name
}

Output Schema:
{
  "total_requests": "int",
  "total_cost_usd": "float",
  "breakdown": [
    {
      "date": "string",
      "tool": "string",
      "requests": "int",
      "cost_usd": "float"
    }
  ]
}

----
DeepSeek Prompt Engineering
System Prompt (generate_code/edit_code)
You are a code generation specialist. Your task is to write clean, working code.

RULES:
1. Return ONLY a JSON object with keys "code" and "explanation"
2. Code must be complete, runnable, and follow best practices for {language}
3. Explanation must be brief (1-2 sentences) describing key decisions
4. No markdown formatting, no code fences, no prose outside JSON
5. If unsure, make reasonable assumptions and document in explanation

OUTPUT FORMAT:
{"code": "...", "explanation": "..."}

System Prompt (review_code)
You are a code reviewer. Analyze the provided code for issues.

Focus areas: {focus_areas}

Return JSON with:
- "code": (original code unchanged)
- "explanation": summary of findings
- "suggestions": array of specific improvements

----
Implementation Details
server.py
from mcp.server import Server
from mcp.types import Tool, TextContent
import json
from .deepseek import DeepSeekClient
from .database import CostDatabase
from .config import load_secrets

class GroveCoderServer:
    def __init__(self):
        self.secrets = load_secrets()
        self.deepseek = DeepSeekClient(self.secrets)
        self.db = CostDatabase("grove_coder.db")
        self.server = Server("grove-coder")
        
        @self.server.list_tools()
        async def list_tools() -> list[Tool]:
            return [
                Tool(
                    name="generate_code",
                    description="Generate new code using DeepSeek specialist",
                    inputSchema={...}  # JSON schema from spec
                ),
                Tool(
                    name="edit_code", 
                    description="Edit existing code using DeepSeek specialist",
                    inputSchema={...}
                ),
                Tool(
                    name="review_code",
                    description="Review code for issues using DeepSeek reasoning",
                    inputSchema={...}
                ),
                Tool(
                    name="get_cost_report",
                    description="Query cost tracking database",
                    inputSchema={...}
                )
            ]
        
        @self.server.call_tool()
        async def call_tool(name: str, arguments: dict) -> list[TextContent]:
            if name in ["generate_code", "edit_code", "review_code"]:
                result = await self.deepseek.call(arguments, name)
                self.db.log_request(name, result["cost_usd"], result["tokens_used"])
                return [TextContent(type="text", text=json.dumps(result))]
            
            elif name == "get_cost_report":
                report = self.db.get_report(arguments["period"], arguments.get("tool"))
                return [TextContent(type="text", text=json.dumps(report))]

deepseek.py
import requests
import json
from typing import Dict, Any

class DeepSeekClient:
    def __init__(self, secrets: dict):
        self.api_key = secrets["openrouter_api_key"]
        self.model = secrets["worker_model"]
        self.zdr = secrets.get("zdr_enabled", True)
        self.providers = secrets.get("preferred_providers", [])
        self.base_url = "https://openrouter.ai/api/v1"
        
    async def call(self, arguments: dict, tool_name: str) -> Dict[str, Any]:
        # Build prompt based on tool
        system_prompt = self._get_system_prompt(tool_name, arguments)
        user_prompt = self._build_user_prompt(arguments, tool_name)
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "X-Title": "grove-coder"
        }
        
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "response_format": {"type": "json_object"},
            "provider": {
                "order": self.providers,
                "require_zdr": self.zdr
            },
            "reasoning": tool_name == "review_code"  # Only for review
        }
        
        response = requests.post(
            f"{self.base_url}/chat/completions",
            headers=headers,
            json=payload
        )
        response.raise_for_status()
        
        data = response.json()
        content = json.loads(data["choices"][0]["message"]["content"])
        
        # Calculate cost
        pricing = data.get("usage", {})
        cost = self._calculate_cost(pricing)
        
        return {
            "code": content.get("code", ""),
            "explanation": content.get("explanation", ""),
            "suggestions": content.get("suggestions", []),
            "cost_usd": cost,
            "tokens_used": {
                "input": pricing.get("prompt_tokens", 0),
                "output": pricing.get("completion_tokens", 0)
            }
        }
    
    def _calculate_cost(self, usage: dict) -> float:
        # DeepSeek V3.2 pricing via OpenRouter
        # Input: $0.25/M, Output: $0.38/M
        input_tokens = usage.get("prompt_tokens", 0)
        output_tokens = usage.get("completion_tokens", 0)

        input_cost = (input_tokens / 1_000_000) * 0.25
        output_cost = (output_tokens / 1_000_000) * 0.38
        
        return round(input_cost + output_cost, 6)

database.py
import sqlite3
from datetime import datetime, timedelta
from typing import Dict, List, Any

class CostDatabase:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._init_db()
    
    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS requests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    tool_name TEXT NOT NULL,
                    cost_usd REAL NOT NULL,
                    input_tokens INTEGER,
                    output_tokens INTEGER,
                    file_path TEXT
                )
            """)
            conn.commit()
    
    def log_request(self, tool_name: str, cost_usd: float, tokens: dict, file_path: str = None):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "INSERT INTO requests (tool_name, cost_usd, input_tokens, output_tokens, file_path) VALUES (?, ?, ?, ?, ?)",
                (tool_name, cost_usd, tokens.get("input"), tokens.get("output"), file_path)
            )
            conn.commit()
    
    def get_report(self, period: str, tool_filter: str = None) -> Dict[str, Any]:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Date filtering
        if period == "today":
            start_date = datetime.now().replace(hour=0, minute=0, second=0)
        elif period == "week":
            start_date = datetime.now() - timedelta(days=7)
        elif period == "month":
            start_date = datetime.now() - timedelta(days=30)
        else:
            start_date = datetime(1970, 1, 1)
        
        query = """
            SELECT date(timestamp) as date, tool_name, COUNT(*) as requests, SUM(cost_usd) as cost
            FROM requests
            WHERE timestamp >= ?
        """
        params = [start_date]
        
        if tool_filter:
            query += " AND tool_name = ?"
            params.append(tool_filter)
        
        query += " GROUP BY date(timestamp), tool_name ORDER BY date DESC"
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        total_cost = sum(row[3] for row in rows)
        total_requests = sum(row[2] for row in rows)
        
        return {
            "total_requests": total_requests,
            "total_cost_usd": round(total_cost, 4),
            "breakdown": [
                {
                    "date": row[0],
                    "tool": row[1],
                    "requests": row[2],
                    "cost_usd": round(row[3], 4)
                }
                for row in rows
            ]
        }

config.py
import json
import os
from pathlib import Path

def load_secrets() -> dict:
    """Load secrets from secrets.json or environment variables."""
    secrets_path = Path("secrets.json")
    
    if secrets_path.exists():
        with open(secrets_path) as f:
            secrets = json.load(f)
    else:
        secrets = {}
    
    # Environment variables override file
    secrets["openrouter_api_key"] = os.getenv("OPENROUTER_API_KEY", secrets.get("openrouter_api_key"))
    
    return secrets

----
pyproject.toml
[project]
name = "grove-coder"
version = "1.0.0"
description = "MCP server bridging MiniMax orchestrator to DeepSeek coding specialist"
requires-python = ">=3.11"
dependencies = [
    "mcp>=1.0.0",
    "requests>=2.31.0",
    "sqlite3-utils>=3.34",
]

[project.scripts]
grove-coder = "grove_coder.server:main"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.uv]
dev-dependencies = [
    "pytest>=7.0",
    "pytest-asyncio>=0.21",
    "ruff>=0.1.0",
]

----
Installation & Usage
# Setup with uv
uv venv
source .venv/bin/activate
uv pip install -e .

# Create secrets.json
cp secrets.example.json secrets.json
# Edit with your OpenRouter key

# Run MCP server
uv run grove-coder

# Or for development with MCP inspector
mcp dev src/grove_coder/server.py

----
MiniMax Orchestrator Configuration
{
  "mcpServers": {
    "grove-coder": {
      "command": "uv",
      "args": ["run", "--project", "/path/to/grove-coder", "grove-coder"],
      "env": {
        "OPENROUTER_API_KEY": "${OPENROUTER_API_KEY}"
      }
    }
  },
  "toolPermissions": {
    "MiniMax-M2.1": {
      "allowed": [
        "grove-coder:generate_code",
        "grove-coder:edit_code", 
        "grove-coder:review_code",
        "grove-coder:get_cost_report"
      ],
      "blocked": [
        "filesystem:*",
        "bash:*",
        "python:*"
      ]
    }
  }
}

----
Cost Monitoring CLI
# scripts/cost_report.py
import sqlite3
import sys
from datetime import datetime

def main():
    conn = sqlite3.connect("grove_coder.db")
    cursor = conn.cursor()
    
    print("=== grove-coder Cost Report ===\n")
    
    # Today's costs
    cursor.execute("""
        SELECT tool_name, COUNT(*), SUM(cost_usd) 
        FROM requests 
        WHERE date(timestamp) = date('now')
        GROUP BY tool_name
    """)
    today = cursor.fetchall()
    
    print(f"Today ({datetime.now().date()}):")
    for tool, count, cost in today:
        print(f"  {tool}: {count} requests, ${cost:.4f}")
    
    # This month
    cursor.execute("""
        SELECT SUM(cost_usd), COUNT(*) 
        FROM requests 
        WHERE strftime('%Y-%m', timestamp) = strftime('%Y-%m', 'now')
    """)
    month_cost, month_count = cursor.fetchone()
    print(f"\nThis Month: {month_count} requests, ${month_cost:.4f}")
    
    # All time
    cursor.execute("SELECT SUM(cost_usd), COUNT(*) FROM requests")
    total_cost, total_count = cursor.fetchone()
    print(f"All Time: {total_count} requests, ${total_cost:.4f}")

if __name__ == "__main__":
    main()

----
Security & ZDR Compliance
•  No file system access: MCP server only exposes code generation tools
•  ZDR enforced: OpenRouter require_zdr: true ensures data isn't retained
•  Provider selection: Routes to Together/Fireworks (US-based) rather than DeepSeek direct
•  Audit trail: All requests logged with cost/tokens for transparency
•  No code execution: Generated code is returned to orchestrator, never executed by this server
----
Future Enhancements
1.  Caching layer: Cache common code patterns to reduce API costs
2.  Quality scoring: Track success rate of generated code (via MiniMax feedback)
3.  Model fallback: If DeepSeek fails, fallback to Qwen Coder
4.  Streaming: Support partial responses for long code generation
5.  Multi-file generation: Generate related files in single request
----
Next Steps:
1.  Scaffold project with uv init grove-coder
2.  Implement server.py with one tool (generate_code)
3.  Test with MCP inspector
4.  Integrate with MiniMax CLI
5.  Benchmark vs Claude Max on real Grove tasks
