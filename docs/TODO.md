# GroveCoder TODO

## Phase 1: Foundation (MVP)

### Project Setup
- [ ] Initialize npm project
- [ ] Configure TypeScript (ES2022, NodeNext)
- [ ] Set up ESLint + Prettier
- [ ] Set up Vitest for testing
- [ ] Install dependencies: @anthropic-ai/sdk, @octokit/rest

### GitHub Action Trigger
- [ ] Create `.github/workflows/grovecoder.yml`
- [ ] Trigger on `issue_comment` event
- [ ] Filter: only PR comments (not issue comments)
- [ ] Filter: only comments from Claude bot
- [ ] Extract PR number, repo, owner from context

### Review Parser (`src/agent/parser.ts`)
- [ ] Detect Claude review format signatures
- [ ] Parse "🔍 Issues & Concerns" section
- [ ] Extract issue severity, title, description
- [ ] Extract file paths and line numbers from `**Location:**`
- [ ] Extract code suggestions from code blocks
- [ ] Parse "✅ Recommendations Summary" priorities
- [ ] Parse final recommendation (approve/request changes)
- [ ] Calculate complexity estimate

### Claude Client (`src/claude/client.ts`)
- [ ] Basic messages API wrapper
- [ ] Prompt caching for system prompt
- [ ] Prompt caching for tool definitions
- [ ] Token usage tracking
- [ ] Cost calculation helper
- [ ] Retry logic with exponential backoff

### Core Tools (`src/tools/`)
- [ ] Tool registry and dispatcher (`index.ts`)
- [ ] Tool schema definitions (`definitions.ts`)
- [ ] `read_file` - GitHub Contents API
- [ ] `write_file` - GitHub Contents API
- [ ] `run_command` - shell execution

### GitHub Client (`src/github/client.ts`)
- [ ] Octokit wrapper with auth
- [ ] Get file contents
- [ ] Create/update file
- [ ] Get PR details
- [ ] Post comment on PR

### Agentic Loop (`src/agent/loop.ts`)
- [ ] Build initial prompt with review context
- [ ] Send to Claude with tools
- [ ] Parse tool_use responses
- [ ] Execute tools and collect results
- [ ] Send tool results back
- [ ] Loop until "done" or limit hit
- [ ] Basic iteration limit (25)

### Git Operations
- [ ] Stage changes (via GitHub API or shell)
- [ ] Commit with descriptive message
- [ ] Push to PR branch

### Testing
- [ ] Create test repo with intentional issues
- [ ] Capture sample Claude review as fixture
- [ ] Unit tests for parser
- [ ] Integration test: full loop with mocked APIs
- [ ] End-to-end test with real PR

---

## Phase 2: Full Loop

### Additional Tools
- [ ] `edit_file` - targeted line edits
- [ ] `list_directory` - GitHub Trees API
- [ ] `search_files` - grep/GitHub Search
- [ ] `git_status` - current state
- [ ] `get_pr_diff` - PR changes
- [ ] `get_pr_comments` - all comments
- [ ] `add_pr_comment` - post updates

### Safety System (`src/agent/safety.ts`)
- [ ] Iteration counter and limit
- [ ] Token budget tracking
- [ ] Cost tracking with $2 cap
- [ ] Execution timeout (15 min)
- [ ] Diff size limits (500 lines/file, 20 files)
- [ ] Protected branch check
- [ ] Protected file patterns

### Status Updates
- [ ] Post "Working on fixes..." comment when starting
- [ ] Post progress updates during long sessions
- [ ] Post summary comment when done
- [ ] Apply labels (working, completed, needs-help)

### Error Handling
- [ ] Graceful API error handling
- [ ] Circuit breaker: 3 consecutive failures
- [ ] Stuck detection: 5 iterations no progress
- [ ] Clean exit with status comment

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

### Human Help Tool
- [ ] Full context dump in comment
- [ ] Attempts summary
- [ ] Blocker categorization
- [ ] Suggested next steps
- [ ] Files modified list
- [ ] Debug info (tokens, time, model)
- [ ] Label management

### Documentation
- [ ] README with setup instructions
- [ ] ARCHITECTURE.md
- [ ] TOOLS.md reference
- [ ] CONTRIBUTING.md

### Test Suite
- [ ] Parser edge cases
- [ ] Safety limit enforcement
- [ ] Tool execution mocks
- [ ] Config validation
- [ ] Error scenarios

---

## Phase 4: Multi-Model Support

- [ ] Abstract LLM client interface
- [ ] Kimi K2 client implementation
- [ ] Model selection in config
- [ ] Fallback logic (cheap → expensive)
- [ ] Per-model token/cost tracking

---

## Phase 5: GitHub App (Public Release)

- [ ] Register GitHub App
- [ ] OAuth installation flow
- [ ] Webhook receiver endpoint
- [ ] Multi-tenant config storage
- [ ] Usage tracking per installation
- [ ] Rate limiting per user
- [ ] Landing page
- [ ] Marketplace listing

---

## Phase 6: Cloudflare Migration

- [ ] Worker webhook handler (`src/triggers/webhook.ts`)
- [ ] Adapt file ops to GitHub API only
- [ ] Evaluate shell command alternatives
- [ ] Durable Objects for state (if needed)
- [ ] Cloudflare Workflows for durability
- [ ] Or: hybrid Worker + Actions for compute

---

## Notes

- Verify exact Claude bot username on first real test
- Keep agent core runtime-agnostic for migration
- Log everything for debugging early issues
