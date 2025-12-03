# GroveCoder

**An autonomous PR remediation agent that fixes issues identified by Claude's GitHub integration.**

## Overview

GroveCoder monitors pull requests for review comments from Claude's GitHub integration, parses the feedback, and autonomously fixes the identified issues using an agentic loop. It commits fixes back to the PR branch and repeats until the PR passes review or hits safety limits.

### Why This Exists

When working remotely (especially from mobile or limited environments), copying Claude's PR feedback to Claude Code manually is friction. GroveCoder removes that friction by automating the fix -> commit -> re-review cycle.

### Target Users

- v1: Personal use (single user, personal repos)
- v2+: Installable GitHub App for teams/orgs

## Architecture

```
+-------------------------------------------------------------------------+
|                           GROVECODER SYSTEM                             |
+-------------------------------------------------------------------------+
|                                                                         |
|  +-----------+    +----------------+    +-------------------+           |
|  |  TRIGGER  |    |  AGENT CORE    |    |  TOOL EXECUTOR    |           |
|  |   LAYER   |--->|  (Portable)    |--->|  (Portable)       |           |
|  +-----------+    +----------------+    +-------------------+           |
|       |                  |                      |                       |
|       v                  v                      v                       |
|  +-----------+    +------------+         +-------------+                |
|  | v1: GH    |    |  Claude    |         | GitHub API  |                |
|  | Actions   |    |  API       |         | + Git CLI   |                |
|  +-----------+    +------------+         +-------------+                |
|  | v2: CF    |                                                          |
|  | Worker    |                                                          |
|  +-----------+                                                          |
|                                                                         |
+-------------------------------------------------------------------------+
```

### Layer Separation

1. **Trigger Layer** (`src/triggers/`) - Event ingestion
2. **Agent Core** (`src/agent/`) - Pure TypeScript, runtime-agnostic agentic loop
3. **Tool Executor** (`src/tools/`) - GitHub API for file ops, shell for commands

## Event Flow

1. Developer pushes code, PR is created
2. Claude GitHub Integration runs, posts review as PR comment
3. GitHub fires `issue_comment` webhook
4. GroveCoder Action triggers and filters for Claude bot comments
5. Agent Core parses feedback, builds context, enters agentic loop
6. Agent loops: prompt -> tool calls -> execute -> repeat (max 25 iterations)
7. Agent pushes final commit to PR branch
8. Push triggers new Claude review (loop continues if needed)
9. Agent posts summary comment on PR

## Setup

### Prerequisites

- Node.js 18+
- npm
- GitHub repository with Claude's GitHub integration enabled

### Installation

```bash
# Clone the repo
git clone https://github.com/AutumnsGrove/GroveCoder.git
cd GroveCoder

# Install dependencies
npm install

# Build
npm run build
```

### Environment Variables

```bash
ANTHROPIC_API_KEY=sk-ant-...   # For Claude API
GITHUB_TOKEN=ghp_...           # Or use Actions' automatic GITHUB_TOKEN
```

### Repository Configuration

Create `.github/grovecoder.yml` in your target repo:

```yaml
version: 1
enabled: true
claude_bot_username: "claude-github[bot]"

limits:
  max_remediation_cycles: 3
  max_files_per_commit: 20

allowed_commands:
  - "npm test"
  - "npm run lint"
  - "npm run typecheck"

protected_paths:
  - ".env*"
  - "*.pem"
  - "secrets/*"
```

## Safety Constraints

GroveCoder has strict safety limits to prevent runaway behavior:

| Limit | Value | Description |
|-------|-------|-------------|
| Max Loop Iterations | 25 | Single agentic session |
| Max Remediation Cycles | 3 | Full push->review->fix cycles |
| Max Cost | $2.00 | Hard cap per remediation |
| Max Execution Time | 15 min | Timeout for entire process |
| Max Lines Per File | 500 | Diff size limit |
| Max Files Per Commit | 20 | Scope limit |

### Scope Restrictions

- Can ONLY push to the PR branch (never main/master)
- Can ONLY modify files in the original PR or direct imports
- CANNOT modify workflow files, secrets, or credential files
- CANNOT install new dependencies without human approval

## Development Phases

- **Phase 1: Foundation (MVP)** - Basic loop, core tools, single fix capability
- **Phase 2: Full Loop** - Multi-iteration, safety limits, status updates
- **Phase 3: Configuration** - Repo config, protected paths, human handoff
- **Phase 4: Multi-Model** - Kimi K2 integration, model fallback
- **Phase 5: GitHub App** - Public release, multi-tenant
- **Phase 6: Cloudflare** - Worker migration (optional)

See `docs/` for detailed specifications.

## Project Structure

```
grovecoder/
├── .github/workflows/       # GitHub Actions workflow
├── src/
│   ├── index.ts             # Entry point
│   ├── triggers/            # Event handlers
│   ├── agent/               # Agentic loop, parser, safety
│   ├── tools/               # Tool implementations
│   ├── github/              # GitHub API client
│   ├── claude/              # Claude API client
│   ├── config/              # Configuration loader
│   └── utils/               # Logging, errors, retry
├── tests/                   # Test suites
├── docs/                    # Specifications and architecture
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Documentation

- [Full Specification](docs/grovecoder-spec.md)
- [Spec Addendum](docs/grovecoder-spec-addendum.md)
- [Development Kickoff](docs/grovecoder-kickoff.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Tools Reference](docs/TOOLS.md)
- [Contributing](docs/CONTRIBUTING.md)
- [Task Tracking](TODOS.md)

## License

MIT

---

*Built with Claude Code*
