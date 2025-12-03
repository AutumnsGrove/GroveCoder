# GroveCoder TODO

> **Current Focus:** Testing End-to-End Pipeline - Debugging Protected Branch Check Issue

---

## 🔥 ACTIVE SESSION - 2025-12-03

### Today's Goal
Get GroveCoder to successfully respond to Claude Code reviews and fix code automatically.

### ✅ What We Accomplished Today

1. **Fixed GitHub Actions Workflow**
   - ✅ Fixed PR branch checkout (was trying to use PR URL as git ref)
   - ✅ Build GroveCoder from `main` branch instead of PR branch
   - ✅ Added workflow trigger on `@grovecoder` mentions
   - ✅ Added `checks: write` permission for Check Runs

2. **Implemented GitHub Check Runs**
   - ✅ Added `createCheckRun()` and `updateCheckRun()` to GitHubClient
   - ✅ Integrated into Actions handler for live progress visibility
   - ✅ Shows "in_progress" status in PR like Claude Code does
   - ✅ Updates with success/failure on completion

3. **Made Parser More Flexible**
   - ✅ Added support for `# PR Review` signature
   - ✅ Added emoji-based headers (🔴, 🟡)
   - ✅ Added `@grovecoder` trigger keyword
   - ✅ Added generic review patterns ("needs fix", "security", "bug")
   - ✅ Removed strict validation - accepts ALL Claude reviews now

4. **Created Test PR**
   - ✅ Created PR #9 with intentionally messy code
   - ✅ Two files with security issues, type safety problems, code quality issues
   - ✅ Claude Code Review successfully triggered and posted comprehensive reviews

### ❌ BLOCKING ISSUE: Protected Branch Check

**Problem:** GroveCoder keeps failing with:
```
[ERROR] Protected branch check failed {"baseBranch":"main"}
[ERROR] Cannot modify PR targeting protected branch: main
```

**What We Tried:**

1. **Attempt 1: Added `allowedTargetBranches` to config** ❌
   - Created `.github/grovecoder.yml` with `allowedTargetBranches: [main]`
   - Didn't work - config doesn't recognize this field

2. **Attempt 2: Set `protectedPaths.branches: []`** ❌
   - Updated config to use correct format
   - Pushed to PR branch (`test/messy-code-for-review`)
   - Still getting protected branch error

**Root Cause Analysis:**

The config loading works, but the protected branch check still blocks. Looking at the code:
- Default protected branches: `['main', 'master', 'production']` (in `src/config/types.ts:192`)
- Config merge: `protectedBranches = [...DEFAULT_PROTECTED_BRANCHES, ...(userPaths.branches ?? [])]` (in `src/config/loader.ts:302`)
- **Issue:** The config ADDS to defaults, doesn't REPLACE them!

**The Bug:**
```typescript
// src/config/loader.ts:302-305
const protectedBranches = [
  ...DEFAULT_PROTECTED_BRANCHES,  // ← Always includes 'main'!
  ...(userPaths.branches ?? []),   // ← Our empty array
];
```

Setting `protectedPaths.branches: []` doesn't help because it ADDS to the defaults, not replaces them.

### 🎯 What to Try Tomorrow

#### Option 1: Fix the Config Merge Logic (RECOMMENDED)
**Location:** `src/config/loader.ts:299-320`

Change from:
```typescript
const protectedBranches = [
  ...DEFAULT_PROTECTED_BRANCHES,
  ...(userPaths.branches ?? []),
];
```

To:
```typescript
// If user specifies branches, use ONLY theirs (allow override of defaults)
const protectedBranches = userPaths.branches !== undefined
  ? userPaths.branches
  : DEFAULT_PROTECTED_BRANCHES;
```

This would allow `protectedPaths.branches: []` to actually disable branch protection.

#### Option 2: Add `allowProtectedBranches` Boolean Flag
Add a simpler config option:
```yaml
safety:
  allowProtectedBranches: true  # Bypass protected branch check
```

Then check this flag before running the protected branch check in `src/agent/loop.ts:93`.

#### Option 3: Change PR Target Branch
Instead of fixing the config, change PR #9 to target a different branch like `develop` instead of `main`.
- This would work immediately without code changes
- But doesn't solve the underlying config issue

#### Option 4: Disable Check for Testing Environment
Add environment variable check:
```typescript
// src/agent/safety.ts
checkProtectedBranch(baseBranch: string): void {
  if (process.env.GROVECODER_ALLOW_PROTECTED === 'true') {
    return; // Skip check in testing mode
  }
  // ... rest of check
}
```

### 📝 Key Files to Check Tomorrow

1. **`src/config/loader.ts:299-320`** - Protected branch merge logic
2. **`src/agent/loop.ts:93`** - Where protected branch check is called
3. **`src/agent/safety.ts:35-50`** - The actual check implementation
4. **`.github/grovecoder.yml`** - Config file (on both `main` AND `test/messy-code-for-review`)

### 🔍 Debugging Steps for Tomorrow

1. Add logging to see what `protectedBranches` array contains after config load
2. Verify config is actually being loaded from the PR branch (not main)
3. Check if there's a config cache issue
4. Test with a fresh PR targeting `develop` branch

### 📊 Test Environment Status

**PR #9:** https://github.com/AutumnsGrove/GroveCoder/pull/9
- Branch: `test/messy-code-for-review`
- Target: `main` (causing the issue)
- Status: Has messy code, Claude reviewed it multiple times
- Latest config: Has `protectedPaths.branches: []` but still blocking

**Workflow Runs:**
- Claude Code Review: ✅ Works perfectly, posts comprehensive reviews
- GroveCoder: ❌ Triggers but fails on protected branch check

**What's Working:**
- ✅ Workflow triggering mechanism
- ✅ Comment detection and parsing
- ✅ Config loading
- ✅ Check Run creation
- ✅ GitHub API integration

**What's Blocking:**
- ❌ Protected branch check prevents agent loop from running

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
- [x] Filter: only comments from Claude bot OR @grovecoder mentions
- [x] Extract PR number, repo, owner from context
- [x] Build from main branch (not PR branch)
- [x] Switch to PR branch for file operations

### Review Parser (`src/agent/parser.ts`) ✅
- [x] Detect Claude review format signatures
- [x] Parse "Issues & Concerns" section
- [x] Extract issue severity (critical/major/minor/suggestion)
- [x] Extract file paths and line numbers
- [x] Extract code suggestions from code blocks
- [x] Parse "Recommendations Summary" priorities
- [x] Parse final recommendation (approve/request-changes/needs-discussion)
- [x] Calculate complexity estimate (low/medium/high)
- [x] Accept ALL Claude reviews (removed strict validation)
- [x] Support emoji headers and flexible formats

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
- [x] Create/update Check Runs for status visibility

### Agentic Loop (`src/agent/loop.ts`) ✅
- [x] Build initial prompt with review context
- [x] Send to Claude with tools
- [x] Parse tool_use responses
- [x] Execute tools sequentially (avoid race conditions)
- [x] Send tool results back to Claude
- [x] Loop until "done" tool or limit hit
- [x] Basic iteration limit (25 iterations)

### Safety System (`src/agent/safety.ts`) ⚠️ NEEDS FIX
- [x] Iteration counter and limit (25 max)
- [x] Token budget tracking
- [x] Cost tracking with $2 cap
- [x] Execution timeout (15 minutes)
- [x] Diff size limits (1000 lines, 20 files)
- [x] Protected file patterns (.env, secrets, .pem, .key, credentials)
- [x] Dangerous shell operator blocking (&&, ||, ;, |, `, $()
- [ ] **Protected branch check - BLOCKING BUG** ⚠️

### Git Operations ✅
- [x] File changes via GitHub API (commit per file)
- [x] Workflow handles git commit after agent completes
- [x] Push to PR branch in workflow

### Testing (Partial)
- [x] Sample Claude review fixtures (`tests/fixtures/`)
- [x] Unit tests for parser (17 tests)
- [x] Unit tests for safety checker (16 tests)
- [x] Unit tests for shell commands (8 tests)
- [x] Create test repo with intentional issues (PR #9)
- [ ] Integration test: full loop with mocked APIs
- [ ] End-to-end test with real PR (blocked by protected branch issue)

---

## Phase 2: Full Loop ⚠️ BLOCKED

### Testing
- [x] **Integration tests with mocked APIs**
- [x] **Create test repository**
  - PR #9 with messy TypeScript code
  - Security vulnerabilities (eval)
  - Memory leaks
  - Type safety issues
- [ ] **End-to-end test** ⚠️ BLOCKED
  - Real PR with Claude review ✅
  - Verify fixes are applied ❌ Blocked by protected branch check
  - Validate commit messages ❌ Not reached yet

### Safety Features ✅
- [x] **Protected branch check** (maybe TOO protective!)
- [x] **Circuit breaker (3 consecutive failures)**

### Status Updates ✅
- [x] **Progress updates during long sessions**
- [x] **Label management**
- [x] **GitHub Check Runs for live status**

---

## Phase 3: Configuration & Polish ⚠️ NEEDS FIX

### Repo Config (`.github/grovecoder.yml`) ⚠️
- [x] **Config schema definition**
- [x] **Config loader with defaults**
- [x] **Validation**
- [x] **Override safety limits (stricter only)**
- [x] **Allowed commands whitelist**
- [ ] **Protected paths patterns** ⚠️ MERGE LOGIC BUG
  - Config loads but doesn't properly override defaults
  - Setting `protectedPaths.branches: []` doesn't disable protection
  - Needs fix in `src/config/loader.ts:299-320`

### Extended Tools ✅
- [x] **`web_fetch` tool**
- [x] **`request_human_help` tool**

### Documentation ✅
- [x] **ARCHITECTURE.md**
- [x] **TOOLS.md reference**
- [x] **CONTRIBUTING.md**

---

## Phase 4: Multi-Model Support ✅ COMPLETE

- [x] **Abstract LLM client interface**
- [x] **Kimi K2 client implementation**
- [x] **Model selection in config**
- [ ] **Fallback logic** (deferred to future)

---

## Phase 5: GitHub App (Public Release)

- [ ] **Register GitHub App**
- [ ] **OAuth installation flow**
- [ ] **Webhook receiver endpoint**
- [ ] **Multi-tenant config storage**
- [ ] **Usage tracking per installation**
- [ ] **Landing page**

---

## Phase 6: Cloudflare Migration

- [ ] **Worker webhook handler**
- [ ] **Adapt file ops to GitHub API only**
- [ ] **Evaluate shell command alternatives**
- [ ] **Durable Objects for state (if needed)**

---

## Quick Stats

| Phase | Total Tasks | Completed | Blocked/Remaining |
|-------|-------------|-----------|-------------------|
| 1     | 48          | 46        | 2 (1 blocked)     |
| 2     | 15          | 13        | 2 (1 blocked)     |
| 3     | 15          | 14        | 1 (config bug)    |
| 4     | 4           | 3         | 1 (deferred)      |
| 5     | 6           | 0         | 6                 |
| 6     | 4           | 0         | 4                 |

**Overall Progress:** 76/92 tasks complete (83%)
**Critical Blocker:** Protected branch config override not working

---

*Last updated: 2025-12-03 21:35 PST*
*Session notes: Successfully implemented Check Runs, flexible parser, and workflow fixes. Blocked on protected branch config merge logic - need to fix tomorrow.*
