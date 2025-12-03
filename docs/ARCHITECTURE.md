# GroveCoder Architecture

This document describes the high-level architecture of GroveCoder, an autonomous PR remediation agent.

## Overview

GroveCoder monitors pull requests for review comments from Claude's GitHub integration, parses the feedback, and autonomously fixes identified issues using an agentic loop.

```
┌─────────────────────────────────────────────────────────────────┐
│                        GitHub Actions                            │
│  (Triggers on issue_comment event when Claude posts a review)   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Trigger Layer                               │
│                   src/triggers/actions.ts                        │
│  • Parse GitHub context (repo, PR number, comment)              │
│  • Load repository config (.github/grovecoder.yml)              │
│  • Validate Claude review format                                 │
│  • Initialize clients and start agent loop                       │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Agent Core                                 │
│                    src/agent/loop.ts                             │
│  • Build initial prompt with review context                      │
│  • Agentic loop: Claude ↔ Tools until done or limit             │
│  • Safety checks (iteration, cost, time, circuit breaker)       │
│  • Progress updates and label management                         │
└─────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
┌────────────────────────────┐  ┌────────────────────────────────┐
│      Claude Client         │  │       Tool Executor            │
│   src/claude/client.ts     │  │     src/tools/index.ts         │
│  • Messages API wrapper    │  │  • Dispatch tool calls         │
│  • Prompt caching          │  │  • File operations (GitHub)    │
│  • Token/cost tracking     │  │  • Shell commands (whitelisted)│
│  • Retry logic             │  │  • PR operations               │
└────────────────────────────┘  └────────────────────────────────┘
                                              │
                                              ▼
                                ┌────────────────────────────────┐
                                │       GitHub Client            │
                                │   src/github/client.ts         │
                                │  • Octokit wrapper             │
                                │  • File read/write via API     │
                                │  • PR comments and labels      │
                                └────────────────────────────────┘
```

## Directory Structure

```
src/
├── agent/           # Core agent logic
│   ├── loop.ts      # Agentic loop implementation
│   ├── parser.ts    # Claude review parser
│   ├── prompt.ts    # System and initial prompts
│   ├── safety.ts    # Safety checks and limits
│   └── types.ts     # Agent type definitions
│
├── claude/          # Claude API integration
│   ├── client.ts    # Messages API client
│   ├── messages.ts  # Message building utilities
│   └── types.ts     # Claude API types
│
├── config/          # Configuration system
│   ├── loader.ts    # YAML config loader
│   ├── types.ts     # Config schema and defaults
│   └── index.ts     # Module exports
│
├── github/          # GitHub API integration
│   ├── client.ts    # Octokit wrapper
│   └── types.ts     # GitHub types
│
├── tools/           # Tool implementations
│   ├── definitions.ts  # Tool schemas for Claude
│   ├── index.ts        # Tool dispatcher
│   ├── file-ops.ts     # File operations
│   ├── shell.ts        # Shell command execution
│   ├── github-api.ts   # PR operations
│   ├── search.ts       # Code search
│   ├── web-fetch.ts    # Documentation fetcher
│   └── human-help.ts   # Human help request
│
├── triggers/        # Event handlers
│   ├── actions.ts   # GitHub Actions handler
│   └── index.ts     # Trigger exports
│
└── utils/           # Shared utilities
    ├── errors.ts    # Custom error classes
    ├── logger.ts    # Structured logging
    └── retry.ts     # Retry logic
```

## Three-Layer Architecture

### 1. Trigger Layer (`src/triggers/`)

Responsible for event ingestion and context setup:

- **GitHub Actions** (`actions.ts`): Handles `issue_comment` webhook events
- Parses environment variables for repository context
- Loads configuration from `.github/grovecoder.yml`
- Validates that the comment is a Claude review
- Initializes clients and starts the agent loop

Future runtimes (Cloudflare Workers, etc.) would add new trigger implementations.

### 2. Agent Core (`src/agent/`)

The runtime-agnostic agentic loop:

- **Loop** (`loop.ts`): Main conversation loop with Claude
  - Builds initial prompt from parsed review
  - Sends messages with tool definitions
  - Executes tools and returns results
  - Continues until done or safety limit

- **Parser** (`parser.ts`): Review content parser
  - Detects Claude review signatures
  - Extracts issues with severity and location
  - Parses recommendations and final verdict

- **Safety** (`safety.ts`): Safety system
  - Iteration limits (default 25)
  - Cost tracking ($2 cap)
  - Time limits (15 minutes)
  - Circuit breaker (3 consecutive failures)
  - Protected branch/file checks

### 3. Tool Executor (`src/tools/`)

Tool implementations that Claude can invoke:

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents via GitHub API |
| `write_file` | Create/overwrite files |
| `edit_file` | Search/replace edits |
| `list_directory` | List directory contents |
| `search_files` | Grep-like code search |
| `run_command` | Execute whitelisted commands |
| `git_status` | Get repository state |
| `get_pr_diff` | Get PR file changes |
| `get_pr_comments` | Get PR comments |
| `add_pr_comment` | Post comments |
| `web_fetch` | Fetch documentation URLs |
| `request_human_help` | Request human assistance |
| `done` | Signal completion |

## Data Flow

1. **Comment Posted**: Claude posts a review comment on a PR
2. **Webhook Fired**: GitHub Actions triggers on `issue_comment`
3. **Context Parsed**: Extract repo, PR number, comment body
4. **Config Loaded**: Load `.github/grovecoder.yml` from PR branch
5. **Review Parsed**: Extract issues, severity, recommendations
6. **Loop Started**: Begin agentic conversation with Claude
7. **Tools Executed**: Claude uses tools to read, edit, run tests
8. **Files Committed**: Changes committed via GitHub API
9. **Summary Posted**: Final summary comment with results
10. **Labels Updated**: Add completion/needs-help labels

## Configuration

Repository configuration via `.github/grovecoder.yml`:

```yaml
version: '1'

safety:
  maxIterations: 15      # Reduce from default 25
  maxCostUsd: 1.0        # Reduce from default $2
  maxExecutionTimeSeconds: 600  # 10 minutes

commands:
  allowed:
    - make test          # Add custom commands
  blocked:
    - npm audit          # Block specific commands

protectedPaths:
  patterns:
    - config/secrets/**  # Additional protected paths
  branches:
    - staging            # Additional protected branches

behavior:
  minSeverity: major     # Skip minor/suggestion issues
  requestReReview: true  # Request re-review after fixes
```

## Safety Guarantees

GroveCoder enforces hard limits that cannot be exceeded:

| Limit | Value | Purpose |
|-------|-------|---------|
| Max Iterations | 25 | Prevent infinite loops |
| Max Cost | $2.00 | Budget control |
| Max Time | 15 min | Prevent hangs |
| Circuit Breaker | 3 failures | Stop on repeated errors |
| Protected Files | *.env, *.pem, etc. | Security |
| Protected Branches | main, master, etc. | Safety |

Users can make limits **stricter** but not looser.

## Extension Points

### Adding New Tools

1. Add schema to `src/tools/definitions.ts`
2. Implement handler in appropriate file
3. Add case to dispatcher in `src/tools/index.ts`
4. Add tests

### Adding New Triggers

1. Create handler in `src/triggers/`
2. Parse event context
3. Call `runAgentLoop()` with options
4. Handle results

### Adding New LLM Providers

1. Implement client interface matching `ClaudeClient`
2. Handle message format translation
3. Implement tool calling protocol
4. Add cost tracking
