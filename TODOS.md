# GroveCoder TODO

> **Current Focus:** Phase 5 - GitHub App (Future) / Testing & Publication

---

## Phase 1: Foundation (MVP) ✅ COMPLETE

### Project Setup ✅
- [x] Initialize npm project with TypeScript (ES2022, NodeNext modules)
- [x] Configure ESLint with TypeScript strict rules
- [x] Set up Vitest for testing with coverage
- [x] Install dependencies: @anthropic-ai/sdk, @octokit/rest

### GitHub Action Trigger ✅
- [x] Create `.github/workflows/grovecoder.yml`
- [x] Trigger on `issue_comment` event
- [x] Filter: only PR comments (not issue comments)
- [x] Filter: only comments from Claude bot
- [x] Extract PR number, repo, owner from context

### Review Parser (`src/agent/parser.ts`) ✅
- [x] Detect Claude review format signatures
- [x] Parse "Issues & Concerns" section
- [x] Extract issue severity (critical/major/minor/suggestion)
- [x] Extract file paths and line numbers
- [x] Extract code suggestions from code blocks
- [x] Parse "Recommendations Summary" priorities
- [x] Parse final recommendation (approve/request-changes/needs-discussion)
- [x] Calculate complexity estimate (low/medium/high)

### Claude Client (`src/claude/client.ts`) ✅
- [x] Basic messages API wrapper
- [x] Prompt caching for system prompt (ephemeral cache_control)
- [x] Prompt caching for tool definitions
- [x] Token usage tracking (input/output/cache tokens)
- [x] Cost calculation helper (per model rates)
- [x] Retry logic with exponential backoff and jitter

### Core Tools (`src/tools/`) ✅
- [x] Tool registry and dispatcher (`index.ts`)
- [x] Tool schema definitions (`definitions.ts`) - 11 tools defined
- [x] `read_file` - GitHub Contents API with caching
- [x] `write_file` - GitHub Contents API with SHA tracking
- [x] `edit_file` - Search/replace with uniqueness validation
- [x] `list_directory` - GitHub Trees API
- [x] `search_files` - grep with pattern matching
- [x] `run_command` - Whitelisted shell execution
- [x] `git_status` - Current repository state
- [x] `get_pr_diff` - PR file changes with patches
- [x] `get_pr_comments` - All PR comments
- [x] `add_pr_comment` - Post markdown comments
- [x] `done` - Completion signal with summary

### GitHub Client (`src/github/client.ts`) ✅
- [x] Octokit wrapper with token auth
- [x] Get file contents (with base64 decoding)
- [x] Create/update file (with SHA handling)
- [x] Get PR details (branch, status, files changed)
- [x] Post/update comments on PR
- [x] Add/remove labels

### Agentic Loop (`src/agent/loop.ts`) ✅
- [x] Build initial prompt with review context
- [x] Send to Claude with tools
- [x] Parse tool_use responses
- [x] Execute tools sequentially (avoid race conditions)
- [x] Send tool results back to Claude
- [x] Loop until "done" tool or limit hit
- [x] Basic iteration limit (25 iterations)

### Safety System (`src/agent/safety.ts`) ✅
- [x] Iteration counter and limit (25 max)
- [x] Token budget tracking
- [x] Cost tracking with $2 cap
- [x] Execution timeout (15 minutes)
- [x] Diff size limits (1000 lines, 20 files)
- [x] Protected file patterns (.env, secrets, .pem, .key, credentials)
- [x] Dangerous shell operator blocking (&&, ||, ;, |, `, $()

### Git Operations ✅
- [x] File changes via GitHub API (commit per file)
- [x] Workflow handles git commit after agent completes
- [x] Push to PR branch in workflow

### Testing (Partial)
- [x] Sample Claude review fixtures (`tests/fixtures/`)
- [x] Unit tests for parser (17 tests)
- [x] Unit tests for safety checker (16 tests)
- [x] Unit tests for shell commands (8 tests)
- [ ] Create test repo with intentional issues
- [ ] Integration test: full loop with mocked APIs
- [ ] End-to-end test with real PR

---

## Phase 2: Full Loop ✅ COMPLETE

### Testing ✅
- [x] **Integration tests with mocked APIs**
  - Mock ClaudeClient responses
  - Mock GitHubClient file operations
  - Test complete agent loop flow
  - Test tool execution chain
- [ ] **Create test repository** (deferred to Phase 3)
  - Sample project with intentional bugs
  - TypeScript errors for testing
  - ESLint violations
  - Missing error handling
- [ ] **End-to-end test** (deferred to Phase 3)
  - Real PR with Claude review
  - Verify fixes are applied correctly
  - Validate commit messages

### Safety Features ✅
- [x] **Protected branch check**
  - Verify PR is not targeting main/master directly
  - Block pushes to protected branches
  - Configurable protected branch patterns (glob support)
- [x] **Circuit breaker (3 consecutive failures)**
  - Track consecutive tool failures
  - Stop agent after 3 failures in a row
  - Post diagnostic comment with status and recovery steps

### Status Updates ✅
- [x] **Progress updates during long sessions**
  - Post update every N iterations (configurable, default 5)
  - Include current progress, time elapsed
  - Show issues fixed count and cost estimate
- [x] **Label management**
  - Add `grovecoder-working` when starting
  - Add `grovecoder-completed` on success
  - Add `grovecoder-needs-help` when stuck
  - Remove working label on completion

---

## Phase 3: Configuration & Polish ✅ COMPLETE

### Repo Config (`.github/grovecoder.yml`) ✅
- [x] **Config schema definition**
  - TypeScript interface for config (`src/config/types.ts`)
  - Version field for compatibility
  - Hard limits that cannot be exceeded
- [x] **Config loader with defaults**
  - Load from `.github/grovecoder.yml`
  - Merge with default values
  - Handle missing config gracefully
- [x] **Validation**
  - Validate against schema
  - Log warnings for unknown fields
  - Fail fast on invalid config
- [x] **Override safety limits (stricter only)**
  - Allow reducing max iterations (1-25)
  - Allow reducing cost cap ($0.10-$2.00)
  - Prevent loosening limits
- [x] **Allowed commands whitelist**
  - User-defined command patterns
  - Merge with default whitelist
  - Blocked command support
- [x] **Protected paths patterns**
  - User-defined protected paths
  - Glob pattern support
  - Merge with defaults
- [x] **Integrate config into agent loop**
  - Load config at startup in actions handler
  - Apply to SafetyChecker via AgentLoopOptions

### Extended Tools ✅
- [x] **`web_fetch` tool**
  - Fetch documentation URLs
  - Parse HTML to text
  - Cache responses (5 min TTL)
  - Timeout handling (10s)
  - Allowed domain whitelist
- [x] **`request_human_help` tool**
  - Post detailed comment explaining blockers
  - Add needs-help label
  - Suggested actions for humans
  - Exit agent gracefully

### Documentation ✅
- [x] **ARCHITECTURE.md** (`docs/ARCHITECTURE.md`)
  - System overview diagram
  - Layer descriptions
  - Data flow explanation
  - Extension points
- [x] **TOOLS.md reference** (`docs/TOOLS.md`)
  - Each tool with examples
  - Input/output schemas
  - Common use cases
  - Error handling
- [x] **CONTRIBUTING.md** (`docs/CONTRIBUTING.md`)
  - Development setup
  - Testing guidelines
  - PR process
  - Code style

---

## Phase 4: Multi-Model Support ✅ COMPLETE

- [x] **Abstract LLM client interface**
  - Define common interface (`src/llm/interface.ts`)
  - Message format abstraction (`src/llm/types.ts`)
  - Tool calling abstraction (OpenAI-compatible format)
  - Token counting interface
- [x] **Kimi K2 client implementation**
  - API integration (Moonshot API at api.moonshot.cn/v1)
  - Message format mapping (OpenAI-compatible)
  - Tool calling support (function calling)
  - Cost tracking
- [x] **Model selection in config**
  - Default model setting (`config.model.provider`)
  - Per-repo override via `.github/grovecoder.yml`
  - Model ID selection (`config.model.model`)
- [ ] **Fallback logic** (deferred to future)
  - Try cheaper model first (Kimi K2)
  - Escalate to Claude on complex issues
  - Track model performance per issue type

---

## Phase 5: GitHub App (Public Release)

- [ ] **Register GitHub App**
  - App manifest creation
  - Required permissions
  - Webhook events subscription
- [ ] **OAuth installation flow**
  - Installation callback handler
  - Token storage (encrypted)
  - Refresh token handling
- [ ] **Webhook receiver endpoint**
  - Signature verification
  - Event type routing
  - Rate limiting
- [ ] **Multi-tenant config storage**
  - Per-installation settings
  - Database schema (Cloudflare D1 or similar)
  - Config caching
- [ ] **Usage tracking per installation**
  - Token usage per repo
  - Cost tracking
  - Usage limits/billing
- [ ] **Landing page**
  - Feature overview
  - Installation button
  - Documentation links
  - Pricing (if applicable)

---

## Phase 6: Cloudflare Migration

- [ ] **Worker webhook handler**
  - HTTP handler setup
  - Request parsing
  - Response formatting
- [ ] **Adapt file ops to GitHub API only**
  - Remove filesystem dependencies
  - All operations via GitHub API
  - Handle rate limits
- [ ] **Evaluate shell command alternatives**
  - GitHub Actions as compute backend
  - External CI service integration
  - Skip shell commands in Workers mode
- [ ] **Durable Objects for state (if needed)**
  - Conversation state storage
  - Long-running job tracking
  - Resume capability

---

## Implementation Notes

### Priority Order
1. ~~Complete Phase 2 testing (critical for reliability)~~ ✅
2. ~~Add protected branch check (safety requirement)~~ ✅
3. ~~Implement label management (UX improvement)~~ ✅
4. ~~Build configuration system (Phase 3)~~ ✅
5. ~~Implement web_fetch and request_human_help tools~~ ✅
6. Integrate config into agent loop
7. Create test repository for E2E testing
8. Documentation (ARCHITECTURE.md, TOOLS.md, CONTRIBUTING.md)

### Technical Debt
- Parser could use more robust regex patterns
- Add input validation to all tool handlers
- Consider rate limiting for GitHub API calls
- Add structured logging (JSON format)

### Open Questions
- Exact Claude bot username to filter (needs verification)
- Optimal iteration count for different issue types
- Best model selection heuristics

---

## Quick Stats

| Phase | Total Tasks | Completed | Remaining |
|-------|-------------|-----------|-----------|
| 1     | 45          | 42        | 3*        |
| 2     | 15          | 13        | 2*        |
| 3     | 15          | 15        | 0         |
| 4     | 4           | 3         | 1**       |
| 5     | 6           | 0         | 6         |
| 6     | 4           | 0         | 4         |

*\*Remaining Phase 1/2 tasks are E2E testing (deferred)*
*\*\*Remaining Phase 4 task is automatic fallback logic (deferred)*

### Phase 4 Complete
- LLM abstraction: 3/3 complete
- Multi-provider support: Claude + Kimi K2
- Config integration: Complete
- Test coverage: 140 tests passing

---

*Last updated: 2025-12-03*
