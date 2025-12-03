# GroveCoder TODO

> **Current Focus:** Phase 1 - Foundation (MVP) - COMPLETE

## Phase 1: Foundation (MVP) ✅

### Project Setup
- [x] Initialize npm project with TypeScript
- [x] Configure ESLint + Prettier
- [x] Set up Vitest for testing
- [x] Install dependencies: @anthropic-ai/sdk, @octokit/rest

### GitHub Action Trigger
- [x] Create `.github/workflows/grovecoder.yml`
- [x] Trigger on `issue_comment` event
- [x] Filter: only PR comments (not issue comments)
- [x] Filter: only comments from Claude bot
- [x] Extract PR number, repo, owner from context

### Review Parser (`src/agent/parser.ts`)
- [x] Detect Claude review format signatures
- [x] Parse "Issues & Concerns" section
- [x] Extract issue severity, title, description
- [x] Extract file paths and line numbers
- [x] Extract code suggestions from code blocks
- [x] Parse "Recommendations Summary" priorities
- [x] Parse final recommendation
- [x] Calculate complexity estimate

### Claude Client (`src/claude/client.ts`)
- [x] Basic messages API wrapper
- [x] Prompt caching for system prompt
- [x] Prompt caching for tool definitions
- [x] Token usage tracking
- [x] Cost calculation helper
- [x] Retry logic with exponential backoff

### Core Tools (`src/tools/`)
- [x] Tool registry and dispatcher (`index.ts`)
- [x] Tool schema definitions (`definitions.ts`)
- [x] `read_file` - GitHub Contents API
- [x] `write_file` - GitHub Contents API
- [x] `run_command` - shell execution

### GitHub Client (`src/github/client.ts`)
- [x] Octokit wrapper with auth
- [x] Get file contents
- [x] Create/update file
- [x] Get PR details
- [x] Post comment on PR

### Agentic Loop (`src/agent/loop.ts`)
- [x] Build initial prompt with review context
- [x] Send to Claude with tools
- [x] Parse tool_use responses
- [x] Execute tools and collect results
- [x] Send tool results back
- [x] Loop until "done" or limit hit
- [x] Basic iteration limit (25)

### Git Operations
- [x] Stage changes (via GitHub API or shell)
- [x] Commit with descriptive message
- [x] Push to PR branch

### Testing
- [ ] Create test repo with intentional issues
- [x] Capture sample Claude review as fixture
- [x] Unit tests for parser
- [ ] Integration test: full loop with mocked APIs
- [ ] End-to-end test with real PR

---

## Phase 2: Full Loop (Partially Complete)

### Additional Tools
- [x] `edit_file` - targeted line edits
- [x] `list_directory` - GitHub Trees API
- [x] `search_files` - grep/GitHub Search
- [x] `git_status` - current state
- [x] `get_pr_diff` - PR changes
- [x] `get_pr_comments` - all comments
- [x] `add_pr_comment` - post updates

### Safety System (`src/agent/safety.ts`)
- [x] Iteration counter and limit
- [x] Token budget tracking
- [x] Cost tracking with $2 cap
- [x] Execution timeout (15 min)
- [x] Diff size limits
- [ ] Protected branch check
- [x] Protected file patterns

### Status Updates
- [x] Post "Working on fixes..." when starting
- [ ] Post progress updates during long sessions
- [x] Post summary comment when done
- [ ] Apply labels (working, completed, needs-help)

### Error Handling
- [x] Graceful API error handling
- [ ] Circuit breaker: 3 consecutive failures
- [x] Stuck detection: 5 iterations no progress
- [x] Clean exit with status comment

---

## Phase 3: Configuration & Polish

### Repo Config (`.github/grovecoder.yml`)
- [ ] Config schema definition
- [ ] Config loader with defaults
- [ ] Validation
- [ ] Override safety limits (stricter only)
- [ ] Allowed commands whitelist
- [ ] Protected paths patterns

### Extended Tools
- [ ] `web_fetch` - fetch URLs for context
- [ ] `request_human_help` - detailed handoff

### Documentation
- [ ] ARCHITECTURE.md
- [ ] TOOLS.md reference
- [ ] CONTRIBUTING.md

---

## Phase 4: Multi-Model Support
- [ ] Abstract LLM client interface
- [ ] Kimi K2 client implementation
- [ ] Model selection in config
- [ ] Fallback logic (cheap -> expensive)

---

## Phase 5: GitHub App (Public Release)
- [ ] Register GitHub App
- [ ] OAuth installation flow
- [ ] Webhook receiver endpoint
- [ ] Multi-tenant config storage
- [ ] Usage tracking per installation
- [ ] Landing page

---

## Phase 6: Cloudflare Migration
- [ ] Worker webhook handler
- [ ] Adapt file ops to GitHub API only
- [ ] Evaluate shell command alternatives
- [ ] Durable Objects for state (if needed)

---

## Notes

- Verify exact Claude bot username on first real test
- Keep agent core runtime-agnostic for migration
- Log everything for debugging early issues
- See `docs/` for detailed specifications
