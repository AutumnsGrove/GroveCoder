# GroveCoder

**An autonomous PR remediation agent that fixes issues identified by Claude's GitHub integration.**

## Overview

GroveCoder monitors pull requests for review comments from Claude's GitHub integration, parses the feedback, and autonomously fixes the identified issues using an agentic loop. It commits fixes back to the PR branch and repeats until the PR passes review or hits safety limits.

### Why This Exists

When working remotely (especially from mobile or limited environments), copying Claude's PR feedback to Claude Code manually is friction. GroveCoder removes that friction by automating the fix → commit → re-review cycle.

### Target Users

- v1: Personal use (single user, personal repos)
- v2+: Installable GitHub App for teams/orgs

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           GROVECODER SYSTEM                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐    ┌──────────────────┐    ┌─────────────────────┐   │
│  │   TRIGGER   │    │   AGENT CORE     │    │   TOOL EXECUTOR     │   │
│  │   LAYER     │───▶│   (Portable)     │───▶│   (Portable)        │   │
│  └─────────────┘    └──────────────────┘    └─────────────────────┘   │
│        │                    │                        │                 │
│        │                    │                        │                 │
│  ┌─────▼─────┐        ┌─────▼─────┐          ┌──────▼──────┐          │
│  │  v1: GH   │        │  Claude   │          │  GitHub API │          │
│  │  Actions  │        │  API      │          │  + Git CLI  │          │
│  ├───────────┤        └───────────┘          └─────────────┘          │
│  │  v2: CF   │                                                         │
│  │  Worker   │                                                         │
│  └───────────┘                                                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Layer Separation (Critical for Migration)

The architecture is split into three layers to enable future Cloudflare migration:

1. **Trigger Layer** (`src/triggers/`)
   - v1: GitHub Actions workflow listens for `issue_comment` events
   - v2: Cloudflare Worker receives webhook from GitHub
   - This layer ONLY handles event ingestion and calls the agent core

2. **Agent Core** (`src/agent/`)
   - Pure TypeScript, no runtime-specific dependencies
   - Implements the agentic loop: prompt → tool calls → execute → repeat
   - Maintains conversation state and safety limits
   - **Must work in both Node.js (Actions) and Workers runtime**

3. **Tool Executor** (`src/tools/`)
   - Implements each tool the agent can call
   - Uses GitHub API for file operations (portable)
   - Shell commands via Actions runner (v1) or... TBD for v2
   - **Note:** Shell execution is tricky in Workers - see migration notes

---

## Event Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│  1. Developer pushes code, PR is created                             │
│                          │                                           │
│                          ▼                                           │
│  2. Claude GitHub Integration runs, posts review as PR COMMENT       │
│                          │                                           │
│                          ▼                                           │
│  3. GitHub fires `issue_comment` webhook (PRs are issues internally) │
│                          │                                           │
│                          ▼                                           │
│  4. GroveCoder Action triggers                                       │
│     - Filters: only comments from Claude bot                         │
│     - Filters: only comments that indicate issues found              │
│                          │                                           │
│                          ▼                                           │
│  5. Agent Core activates                                             │
│     - Parses Claude's feedback                                       │
│     - Builds initial prompt with context                             │
│     - Enters agentic loop                                            │
│                          │                                           │
│                          ▼                                           │
│  6. Agent Loop (max N iterations)                                    │
│     ┌────────────────────────────────────────┐                       │
│     │  a. Send prompt + history to Claude    │                       │
│     │  b. Receive tool_use response          │                       │
│     │  c. Execute tools (read/edit/commit)   │                       │
│     │  d. Send tool results back             │                       │
│     │  e. If Claude says "done" → exit       │                       │
│     │  f. If more tools requested → loop     │                       │
│     └────────────────────────────────────────┘                       │
│                          │                                           │
│                          ▼                                           │
│  7. Agent pushes final commit to PR branch                           │
│                          │                                           │
│                          ▼                                           │
│  8. Push triggers new Claude review (loop continues if needed)       │
│                          │                                           │
│                          ▼                                           │
│  9. Agent posts summary comment on PR                                │
│     "Fixed 3 issues. 1 issue needs human review: [details]"          │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Tool Definitions

### Core Tools (v1 Required)

| Tool | Description | Implementation |
|------|-------------|----------------|
| `read_file` | Read contents of a file at given path | GitHub Contents API |
| `write_file` | Create or overwrite a file | GitHub Contents API |
| `edit_file` | Apply targeted edits to a file (line ranges or search/replace) | GitHub Contents API |
| `list_directory` | List files and folders in a directory | GitHub Trees API |
| `search_files` | Search for patterns across the codebase | GitHub Search API or local grep |
| `run_command` | Execute shell command (tests, linting, type-check) | Actions runner shell |
| `git_status` | Check current git status | Shell |
| `git_commit` | Stage and commit changes with message | Shell |
| `git_push` | Push commits to remote | Shell |
| `get_pr_diff` | Get the diff for the current PR | GitHub Pull Request API |
| `get_pr_comments` | Read all comments on the PR | GitHub Issues API |
| `add_pr_comment` | Post a comment on the PR | GitHub Issues API |

### Extended Tools (v1 Nice-to-Have)

| Tool | Description | Implementation |
|------|-------------|----------------|
| `web_fetch` | Fetch content from a URL (docs, CVE details) | Native fetch |
| `request_human_help` | Flag an issue as needing human intervention | Post comment + add label |

### Future Tools (v2+)

| Tool | Description |
|------|-------------|
| `web_search` | Search the web for solutions |
| `read_documentation` | Parse and search project docs |
| `run_tests_isolated` | Run specific test files |
| `analyze_image` | For UI-related PRs |

---

## Safety Constraints

These are NON-NEGOTIABLE for v1:

### Iteration Limits

```typescript
const SAFETY_LIMITS = {
  // Max agentic loop iterations per trigger
  maxLoopIterations: 25,
  
  // Max full PR remediation cycles (push → review → fix → push)
  maxRemediationCycles: 3,
  
  // Max total API calls to Claude per trigger
  maxApiCalls: 50,
  
  // Max tokens sent per API call (context limit safety)
  maxTokensPerCall: 100_000,
  
  // Timeout for entire remediation process
  maxExecutionTimeMs: 15 * 60 * 1000, // 15 minutes
};
```

### Diff Limits

```typescript
const DIFF_LIMITS = {
  // Max lines changed in a single file
  maxLinesPerFile: 500,
  
  // Max files changed in a single commit  
  maxFilesPerCommit: 20,
  
  // Max total lines changed across all files
  maxTotalLines: 1000,
};
```

### Scope Restrictions

- Agent can ONLY push to the PR branch, never to main/master/protected branches
- Agent can ONLY modify files that were part of the original PR OR files directly imported by them
- Agent CANNOT modify workflow files (`.github/workflows/*`)
- Agent CANNOT modify secrets, env files, or config files with credentials
- Agent CANNOT run commands that install new dependencies without human approval

### Circuit Breakers

- If 3 consecutive commits don't improve the Claude review score, STOP and request human help
- If any command returns a non-zero exit code 3 times in a row, STOP and report
- If Claude API returns an error, retry 2x with backoff, then STOP

---

## Configuration

### Repository Config File (`.github/grovecoder.yml`)

```yaml
# GroveCoder Configuration
version: 1

# Enable/disable GroveCoder for this repo
enabled: true

# Which Claude comment author to respond to
claude_bot_username: "claude-github[bot]"  # or whatever the actual username is

# Safety overrides (can only be MORE restrictive, not less)
limits:
  max_remediation_cycles: 2
  max_files_per_commit: 10

# Commands allowed to run
allowed_commands:
  - "npm test"
  - "npm run lint"
  - "npm run typecheck"
  - "cargo test"
  - "cargo clippy"

# Files/patterns the agent should never touch
protected_paths:
  - ".env*"
  - "*.pem"
  - "*.key"
  - "secrets/*"

# Labels to apply during remediation
labels:
  in_progress: "grovecoder-working"
  needs_human: "grovecoder-needs-help"
  completed: "grovecoder-fixed"

# Notification settings
notifications:
  # Post status comments during remediation
  status_comments: true
  # Mention user when human help needed
  mention_on_stuck: true
```

### Environment Variables / Secrets

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_TOKEN=ghp_...  # or use Actions' automatic GITHUB_TOKEN

# Optional
GROVECODER_LOG_LEVEL=debug
GROVECODER_DRY_RUN=false  # If true, don't actually commit
```

---

## File Structure

```
grovecoder/
├── .github/
│   └── workflows/
│       └── grovecoder.yml           # The Action that triggers on PR comments
│
├── src/
│   ├── index.ts                      # Entry point for Actions
│   │
│   ├── triggers/
│   │   ├── actions.ts                # GitHub Actions event handler
│   │   └── webhook.ts                # (v2) Cloudflare Worker webhook handler
│   │
│   ├── agent/
│   │   ├── loop.ts                   # Core agentic loop implementation
│   │   ├── prompt.ts                 # System prompt and context building
│   │   ├── parser.ts                 # Parse Claude's review comments
│   │   ├── state.ts                  # Conversation state management
│   │   └── safety.ts                 # Safety checks and limits
│   │
│   ├── tools/
│   │   ├── index.ts                  # Tool registry and dispatcher
│   │   ├── definitions.ts            # Tool schemas for Claude
│   │   ├── file-ops.ts               # read_file, write_file, edit_file
│   │   ├── git-ops.ts                # git_status, git_commit, git_push
│   │   ├── github-api.ts             # PR operations, comments, etc.
│   │   ├── shell.ts                  # run_command implementation
│   │   └── web.ts                    # web_fetch implementation
│   │
│   ├── github/
│   │   ├── client.ts                 # GitHub API client wrapper
│   │   ├── types.ts                  # GitHub API types
│   │   └── auth.ts                   # Authentication handling
│   │
│   ├── claude/
│   │   ├── client.ts                 # Claude API client
│   │   ├── types.ts                  # Claude API types
│   │   └── messages.ts               # Message formatting utilities
│   │
│   ├── config/
│   │   ├── loader.ts                 # Load repo config file
│   │   ├── schema.ts                 # Config validation
│   │   └── defaults.ts               # Default configuration
│   │
│   └── utils/
│       ├── logger.ts                 # Logging utilities
│       ├── errors.ts                 # Custom error types
│       └── retry.ts                  # Retry logic with backoff
│
├── tests/
│   ├── agent/
│   ├── tools/
│   └── fixtures/                     # Sample Claude reviews, PRs, etc.
│
├── docs/
│   ├── ARCHITECTURE.md               # Detailed architecture docs
│   ├── TOOLS.md                      # Tool documentation
│   ├── MIGRATION.md                  # Cloudflare migration guide
│   └── CONTRIBUTING.md
│
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
└── LICENSE
```

---

## Implementation Phases

### Phase 1: Foundation (MVP)

**Goal:** Get basic loop working for a single, simple fix

- [ ] Project scaffolding (TypeScript, ESLint, Vitest)
- [ ] GitHub Actions workflow that triggers on `issue_comment`
- [ ] Filter logic: identify Claude's review comments
- [ ] Basic Claude API client
- [ ] Implement core tools: `read_file`, `write_file`, `run_command`
- [ ] Basic agentic loop (single iteration)
- [ ] Git commit and push
- [ ] Test end-to-end with a real PR

**Deliverable:** Agent can read Claude's feedback, make a single fix, and commit

### Phase 2: Full Loop

**Goal:** Complete agentic loop with safety limits

- [ ] Multi-iteration agentic loop
- [ ] Safety limits (iteration count, diff size, timeout)
- [ ] Remaining core tools: `edit_file`, `list_directory`, `search_files`, `git_status`
- [ ] PR tools: `get_pr_diff`, `get_pr_comments`, `add_pr_comment`
- [ ] Status comments on PR ("Working on fixes...", "Completed", etc.)
- [ ] Error handling and graceful failures
- [ ] Logging and observability

**Deliverable:** Agent can fully remediate a PR through multiple fix cycles

### Phase 3: Configuration & Polish

**Goal:** Make it configurable and robust

- [ ] Repo config file support (`.github/grovecoder.yml`)
- [ ] Protected paths enforcement
- [ ] Allowed commands whitelist
- [ ] Labels management
- [ ] `web_fetch` tool
- [ ] `request_human_help` tool
- [ ] Circuit breakers (stuck detection)
- [ ] Comprehensive test suite
- [ ] Documentation

**Deliverable:** Production-ready for personal use

### Phase 4: Multi-Model Support

**Goal:** Swap in alternative LLMs

- [ ] Abstract LLM client interface
- [ ] Kimi K2 integration
- [ ] Model selection via config
- [ ] Fallback logic (try cheaper model first, escalate if needed)

**Deliverable:** Can use Kimi K2 for simple fixes, Claude for complex ones

### Phase 5: GitHub App & Public Release

**Goal:** Installable by others

- [ ] GitHub App registration
- [ ] OAuth flow for installation
- [ ] Multi-tenant configuration
- [ ] Usage tracking and rate limiting
- [ ] Landing page and docs site
- [ ] Publish to GitHub Marketplace

**Deliverable:** Others can install and use GroveCoder

### Phase 6: Cloudflare Migration (Optional)

**Goal:** Run on your own infrastructure

- [ ] Cloudflare Worker webhook handler
- [ ] Adapt tool implementations for Workers runtime
- [ ] Durable Objects for state management (if needed)
- [ ] Queue for long-running jobs (Workers have execution limits)
- [ ] Or: Use Cloudflare Workflows for durable execution

**See Migration Notes below**

---

## Migration Notes: Actions → Cloudflare

### What Ports Easily

- **Agent Core:** Pure TypeScript, works in both runtimes ✅
- **GitHub API calls:** Just HTTP, works everywhere ✅
- **Claude API calls:** Just HTTP, works everywhere ✅
- **web_fetch:** Native in both ✅
- **Config loading:** Just file reads via GitHub API ✅

### What Needs Work

- **Shell command execution:** This is the big one
  - Actions: Easy, just spawn a process
  - Workers: No shell access
  - **Options:**
    1. Use GitHub Actions as a "compute backend" - Worker triggers Action for shell commands
    2. Build/test commands only - use GitHub's own Actions runners via API
    3. Skip shell commands in Workers mode, only do file-based fixes
    4. Use a separate compute service (fly.io, railway, etc.)

- **Git operations:** 
  - Actions: Git CLI works
  - Workers: Must use GitHub API for commits (possible, just different)

- **File system access:**
  - Actions: Full filesystem
  - Workers: GitHub API only (which is fine, we should use it anyway for portability)

### Recommended Migration Strategy

1. From day 1, use GitHub API for file operations (not filesystem)
2. Use GitHub API for git operations where possible
3. Isolate shell commands behind an interface
4. When migrating, either:
   - Accept that shell commands require a separate service
   - Use a hybrid: Worker for orchestration, Action for compute

---

## Open Questions

1. **Claude bot username:** What exactly is the username/app that posts Claude's reviews? Need to filter for this.

2. **Review format:** What does Claude's review comment structure look like? Need examples to build parser.

3. **Model for v1:** Start with Claude Sonnet for cost efficiency, or Claude Opus for capability? (Recommend Sonnet, escalate to Opus if stuck)

4. **Monorepo support:** Should v1 handle monorepos, or assume single-project repos?

5. **Language agnostic:** Should work with any language, or optimize for your common stack (TS/Rust/Go)?

---

## Success Metrics

### v1 Success Criteria

- [ ] Can successfully fix at least 70% of Claude's review comments automatically
- [ ] Zero incidents of pushing to wrong branch or corrupting repo
- [ ] Completes remediation in under 10 minutes for typical PRs
- [ ] Clear failure messages when it can't fix something

### Long-term Goals

- Reduce PR review → merge time by 50%+
- Build a portfolio piece demonstrating AI agent development
- Learn agent patterns applicable to other projects
- Eventually: help others automate their workflows too

---

## Getting Started (For Claude Code)

1. Initialize the project:
   ```bash
   mkdir grovecoder && cd grovecoder
   npm init -y
   npm install typescript @types/node vitest
   npm install @anthropic-ai/sdk @octokit/rest
   npx tsc --init
   ```

2. Start with Phase 1 tasks in order

3. Create a test repo to validate against

4. Document decisions and learnings as you go

---

## License

MIT (or your preference)

---

*Spec version: 1.0*
*Last updated: 2025-12-03*
*Author: Autumn + Claude*
