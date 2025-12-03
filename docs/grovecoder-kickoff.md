# GroveCoder - Development Kickoff

**Hand this file + the spec + addendum to Claude Code to begin development.**

## What We're Building

An autonomous GitHub PR remediation agent. When Claude's GitHub integration reviews a PR and posts feedback, GroveCoder automatically:
1. Parses the feedback
2. Fixes the issues using an agentic loop
3. Commits and pushes
4. Repeats until done or stuck

## Key Design Decisions

- **Runtime v1:** GitHub Actions (Node.js, Claude SDK works fine)
- **Runtime v2:** Cloudflare Worker (planned, architecture supports migration)
- **Default Model:** Claude Sonnet 4 (escalate to Opus for complex/security ~5%)
- **Caching:** Use Anthropic prompt caching for system prompt + tools (25% cost savings)
- **Safety:** Hard limits on iterations (25), cost ($2), time (15min)

## Claude's Review Format

Claude posts structured reviews with:
- `## 🔍 Issues & Concerns` - numbered issues with file locations + suggested fixes
- `## ✅ Recommendations Summary` - priority tiers (must fix / should fix / nice to have)
- `**Recommendation:**` - final verdict

The parser extracts issues, file paths, line numbers, and code suggestions.

## Files to Reference

1. `GROVECODER_SPEC.md` - Full architecture, tools, phases, file structure
2. `GROVECODER_SPEC_ADDENDUM.md` - Caching, parser details, model selection, cost analysis

## Phase 1 Checklist (MVP)

```
[ ] Project scaffolding
    - TypeScript + ESLint + Vitest
    - @anthropic-ai/sdk + @octokit/rest
    
[ ] GitHub Action workflow (.github/workflows/grovecoder.yml)
    - Trigger on issue_comment
    - Filter for Claude bot comments
    
[ ] Review parser (src/agent/parser.ts)
    - Extract issues from "🔍 Issues & Concerns" section
    - Get file paths and line numbers
    - Get suggested code fixes
    - Get priority from "Recommendations Summary"
    
[ ] Claude client with caching (src/claude/client.ts)
    - Prompt caching for system prompt + tools
    - Token tracking
    
[ ] Core tools (src/tools/)
    - read_file (GitHub Contents API)
    - write_file (GitHub Contents API)  
    - run_command (shell via Actions runner)
    
[ ] Basic agentic loop (src/agent/loop.ts)
    - Send context + tools to Claude
    - Execute tool calls
    - Loop until done or limit hit
    
[ ] Git operations
    - Commit changes
    - Push to PR branch
    
[ ] End-to-end test with a real PR
```

## Quick Start Commands

```bash
# Initialize
mkdir grovecoder && cd grovecoder
npm init -y

# Dependencies
npm install typescript @types/node
npm install @anthropic-ai/sdk @octokit/rest
npm install -D vitest eslint @typescript-eslint/parser

# TypeScript config
npx tsc --init --target ES2022 --module NodeNext --moduleResolution NodeNext --outDir dist --rootDir src --strict true

# Create structure
mkdir -p src/{agent,tools,github,claude,config,utils,triggers}
mkdir -p .github/workflows
mkdir -p tests/{agent,tools,fixtures}
```

## Environment Variables Needed

```bash
ANTHROPIC_API_KEY=sk-ant-...   # For Claude API
GITHUB_TOKEN=...               # Auto-provided in Actions, or PAT for local dev
```

## Test Repo Setup

Create a test repo with a simple PR that has intentional issues:
- A typo in a comment
- A missing null check
- An unused import

Then manually trigger Claude's review to generate test data.

## Success Criteria for Phase 1

- [ ] Can detect Claude's review comment on a PR
- [ ] Can parse at least the "Issues" section correctly
- [ ] Can read a file, make a change, and commit it
- [ ] Makes at least one successful fix automatically
- [ ] Stops gracefully when hitting limits

---

Good luck! 🌲
