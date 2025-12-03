# GroveCoder Spec Addendum

**Additions based on Claude review format analysis and cost optimization requirements.**

---

## Claude Bot Identification

```typescript
const CLAUDE_BOT_IDENTIFIER = {
  // The comment author username
  username: "claude",  // or "claude[bot]" - need to verify exact string
  
  // Backup: check if comment body matches Claude's review format
  formatSignatures: [
    "# PR Review:",
    "## ✨ What I Love",
    "## 🔍 Issues & Concerns",
    "## ✅ Recommendations Summary",
  ],
};

function isClaudeReview(comment: GitHubComment): boolean {
  // Primary check: author
  if (comment.user.login.toLowerCase().includes("claude") && 
      comment.user.type === "Bot") {
    return true;
  }
  
  // Fallback: format detection
  const hasSignatures = CLAUDE_BOT_IDENTIFIER.formatSignatures
    .filter(sig => comment.body.includes(sig)).length >= 2;
  
  return hasSignatures;
}
```

---

## Review Parser Specification

Claude's reviews follow a consistent structure. Here's how to parse them:

### Review Structure

```
# PR Review: {title}

## ✨ What I Love
{positive feedback - can skip for remediation}

## 🔍 Issues & Concerns
### 1. {severity}: {issue title}
**Location:** `{file_path}:{line_numbers}`
{description}
**Problem:** {explanation}
**Suggested fix:**
```{language}
{code}
```

## 🛡️ Security Review
{security items with ✅ or ⚠️ prefixes}

## 📊 Performance Considerations
{performance items}

## 🎯 Minor Polish
{numbered list of small fixes}

## ✅ Recommendations Summary
**Must fix before merge:**
{numbered list}

**Should fix before merge:**
{numbered list}

**Nice to have:**
{numbered list}

## 🌟 Overall Assessment
{summary}
**Recommendation:** {Approve|Approve with minor fixes|Request changes}
```

### Parser Implementation

```typescript
interface ParsedIssue {
  id: number;
  severity: "critical" | "high" | "medium" | "low" | "polish";
  title: string;
  location?: {
    file: string;
    startLine?: number;
    endLine?: number;
  };
  description: string;
  problem?: string;
  suggestedFix?: {
    language: string;
    code: string;
  };
  priority: "must_fix" | "should_fix" | "nice_to_have";
}

interface ParsedReview {
  title: string;
  issues: ParsedIssue[];
  securityItems: Array<{ passed: boolean; description: string }>;
  performanceItems: string[];
  polishItems: string[];
  recommendation: "approve" | "approve_with_fixes" | "request_changes";
  estimatedComplexity: "simple" | "moderate" | "complex";
}

function parseClaudeReview(body: string): ParsedReview {
  // Implementation details...
  
  // Key patterns to extract:
  const patterns = {
    // Issue with location
    issueWithLocation: /### \d+\. \*\*(\w+):(.*?)\*\*\s+\*\*Location:\*\* `([^`]+)`/g,
    
    // File path and line numbers
    filePath: /`([^`]+\.(?:js|ts|svelte|rs|go|py|jsx|tsx)):(\d+)(?:-(\d+))?`/,
    
    // Code block with suggestion
    codeBlock: /\*\*Suggested (?:fix|approach):\*\*\s*```(\w+)\n([\s\S]*?)```/g,
    
    // Priority sections
    mustFix: /\*\*Must fix before merge:\*\*\s*([\s\S]*?)(?=\*\*Should fix|\*\*Nice to have|##)/,
    shouldFix: /\*\*Should fix before merge:\*\*\s*([\s\S]*?)(?=\*\*Nice to have|##)/,
    niceToHave: /\*\*Nice to have:\*\*\s*([\s\S]*?)(?=##)/,
    
    // Recommendation
    recommendation: /\*\*Recommendation:\*\* (Approve|Approve with minor fixes|Request changes)/i,
  };
  
  // ... parsing logic
}
```

### Severity Mapping

```typescript
const severityKeywords: Record<string, ParsedIssue["severity"]> = {
  "critical": "critical",
  "security": "critical",
  "bug": "high",
  "important": "high",
  "concern": "medium",
  "warning": "medium",
  "minor": "low",
  "polish": "polish",
  "typo": "polish",
  "nitpick": "polish",
};

function extractSeverity(issueTitle: string): ParsedIssue["severity"] {
  const lower = issueTitle.toLowerCase();
  for (const [keyword, severity] of Object.entries(severityKeywords)) {
    if (lower.includes(keyword)) return severity;
  }
  return "medium"; // default
}
```

---

## Caching Strategy (Cost Optimization)

### Anthropic Prompt Caching

The Claude API supports prompt caching, which can significantly reduce costs for repeated context. Here's how GroveCoder should use it:

```typescript
// System prompt should be cached - it's the same across all calls
const SYSTEM_PROMPT_CACHE_CONTROL = {
  type: "ephemeral" as const,  // Cache for the duration of the session
};

async function callClaude(
  messages: Message[],
  tools: Tool[],
  options: { useCache: boolean }
): Promise<ClaudeResponse> {
  const systemPrompt = buildSystemPrompt(); // ~2000 tokens, stable
  
  return await anthropic.messages.create({
    model: selectedModel,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: systemPrompt,
        // Cache the system prompt - saves ~$0.003 per call for Sonnet
        cache_control: options.useCache ? SYSTEM_PROMPT_CACHE_CONTROL : undefined,
      },
    ],
    tools: tools.map(tool => ({
      ...tool,
      // Cache tool definitions too - they don't change
      cache_control: options.useCache ? SYSTEM_PROMPT_CACHE_CONTROL : undefined,
    })),
    messages,
  });
}
```

### What to Cache

| Content | Size (est.) | Cache? | Savings |
|---------|-------------|--------|---------|
| System prompt | ~2000 tokens | ✅ Yes | ~90% on input cost |
| Tool definitions | ~3000 tokens | ✅ Yes | ~90% on input cost |
| Claude's original review | ~2000-5000 tokens | ✅ Yes (first message) | ~90% on input cost |
| Conversation history | Varies | ❌ No (changes each turn) | N/A |
| File contents | Varies | ❌ No (changes each turn) | N/A |

### Cost Estimation

**Without caching (per agentic loop iteration):**
- Input: ~10,000 tokens × $3.00/M = $0.03
- Output: ~2,000 tokens × $15.00/M = $0.03
- **Total per iteration: ~$0.06**

**With caching (per iteration after first):**
- Cached input: ~5,000 tokens × $0.30/M = $0.0015
- Fresh input: ~5,000 tokens × $3.00/M = $0.015
- Output: ~2,000 tokens × $15.00/M = $0.03
- **Total per iteration: ~$0.045** (25% savings)

**Per PR remediation (assuming 5 iterations avg):**
- Without caching: ~$0.30
- With caching: ~$0.24
- **Monthly (20 PRs): $4.80-6.00**

### Token Budget Tracking

```typescript
interface TokenBudget {
  maxInputTokensPerCall: number;
  maxOutputTokensPerCall: number;
  maxTotalTokensPerRemediation: number;
  warningThreshold: number; // Warn when this % of budget used
}

const DEFAULT_BUDGET: TokenBudget = {
  maxInputTokensPerCall: 100_000,
  maxOutputTokensPerCall: 8_000,
  maxTotalTokensPerRemediation: 500_000,
  warningThreshold: 0.8,
};

class TokenTracker {
  private inputTokens = 0;
  private outputTokens = 0;
  private cachedTokens = 0;
  
  record(usage: ClaudeUsage): void {
    this.inputTokens += usage.input_tokens;
    this.outputTokens += usage.output_tokens;
    this.cachedTokens += usage.cache_read_input_tokens || 0;
  }
  
  getCost(model: "sonnet" | "opus"): number {
    const rates = model === "sonnet" 
      ? { input: 3.0, output: 15.0, cached: 0.3 }
      : { input: 15.0, output: 75.0, cached: 1.5 };
    
    const freshInput = this.inputTokens - this.cachedTokens;
    return (
      (freshInput / 1_000_000) * rates.input +
      (this.cachedTokens / 1_000_000) * rates.cached +
      (this.outputTokens / 1_000_000) * rates.output
    );
  }
  
  isOverBudget(budget: TokenBudget): boolean {
    return (this.inputTokens + this.outputTokens) > budget.maxTotalTokensPerRemediation;
  }
}
```

---

## Model Selection Logic

### Default: Sonnet | Escalate: Opus

```typescript
interface ModelSelectionCriteria {
  issueCount: number;
  hasCriticalIssues: boolean;
  hasSecurityIssues: boolean;
  totalFilesAffected: number;
  estimatedComplexity: "simple" | "moderate" | "complex";
  previousAttemptsFailed: number;
}

function selectModel(criteria: ModelSelectionCriteria): "sonnet" | "opus" {
  // Escalate to Opus (~5% of cases) when:
  
  // 1. Critical security issues
  if (criteria.hasSecurityIssues && criteria.hasCriticalIssues) {
    return "opus";
  }
  
  // 2. High complexity (many interconnected issues)
  if (criteria.estimatedComplexity === "complex" && criteria.issueCount > 5) {
    return "opus";
  }
  
  // 3. Previous attempts with Sonnet failed
  if (criteria.previousAttemptsFailed >= 2) {
    return "opus";
  }
  
  // 4. Large refactoring needed (many files)
  if (criteria.totalFilesAffected > 10) {
    return "opus";
  }
  
  // Default to Sonnet for everything else
  return "sonnet";
}

// Complexity estimation from parsed review
function estimateComplexity(review: ParsedReview): "simple" | "moderate" | "complex" {
  const mustFixCount = review.issues.filter(i => i.priority === "must_fix").length;
  const hasMultiFileIssues = new Set(
    review.issues.map(i => i.location?.file).filter(Boolean)
  ).size > 3;
  
  if (mustFixCount === 0 || (mustFixCount === 1 && !hasMultiFileIssues)) {
    return "simple";
  }
  
  if (mustFixCount <= 3 && !hasMultiFileIssues) {
    return "moderate";
  }
  
  return "complex";
}
```

### Cost Comparison

| Model | Input $/M | Output $/M | Use When |
|-------|-----------|------------|----------|
| Sonnet | $3.00 | $15.00 | Default (95% of PRs) |
| Opus | $15.00 | $75.00 | Complex/security/stuck (5%) |

**Expected monthly cost with escalation:**
- 19 PRs × Sonnet ($0.24) = $4.56
- 1 PR × Opus ($1.20) = $1.20
- **Total: ~$5.76/month**

---

## Enhanced `request_human_help` Tool

### Purpose

When the agent encounters issues it cannot resolve, it should gracefully hand off to a human with full context so they can pick up exactly where the agent left off.

### Tool Definition

```typescript
const requestHumanHelpTool: Tool = {
  name: "request_human_help",
  description: `
    Request human intervention when you cannot complete a fix.
    Use this when:
    - You've tried multiple approaches and none work
    - The fix requires decisions beyond your scope (architecture, dependencies)
    - You don't have enough context to understand the issue
    - The fix would require changes to protected files
    - You encounter permissions or access issues
    
    This will post a detailed comment on the PR and add a label for visibility.
    The human can then continue from where you left off.
  `,
  input_schema: {
    type: "object",
    properties: {
      issue_reference: {
        type: "string",
        description: "Which issue from Claude's review this relates to (e.g., 'Issue #2: Model Version Hardcoding')",
      },
      attempts_summary: {
        type: "string", 
        description: "What you tried and why it didn't work. Be specific about approaches attempted.",
      },
      blocker_reason: {
        type: "string",
        enum: [
          "insufficient_context",
          "requires_architecture_decision",
          "requires_dependency_changes",
          "requires_protected_file_access",
          "permission_denied",
          "test_failures_unresolved",
          "too_complex",
          "other",
        ],
        description: "The category of blocker",
      },
      blocker_details: {
        type: "string",
        description: "Detailed explanation of what's blocking progress",
      },
      suggested_next_steps: {
        type: "array",
        items: { type: "string" },
        description: "Recommended actions for the human to take",
      },
      files_modified: {
        type: "array",
        items: { type: "string" },
        description: "Files you've already modified (human should review these)",
      },
      files_to_check: {
        type: "array", 
        items: { type: "string" },
        description: "Files the human should look at to understand the issue",
      },
      partial_progress: {
        type: "string",
        description: "What you DID accomplish before getting stuck (if anything)",
      },
    },
    required: [
      "issue_reference",
      "attempts_summary", 
      "blocker_reason",
      "blocker_details",
      "suggested_next_steps",
    ],
  },
};
```

### Generated Comment Format

When `request_human_help` is called, post this comment:

```markdown
## 🤖 GroveCoder needs human help

I was working on fixing issues from Claude's review but hit a blocker I can't resolve on my own.

### Issue I'm stuck on
> {issue_reference}

### What I tried
{attempts_summary}

### Why I'm stuck
**Blocker type:** {blocker_reason}

{blocker_details}

### Progress so far
{partial_progress || "No changes committed yet."}

**Files I modified:**
{files_modified.map(f => `- \`${f}\``).join('\n') || "None yet"}

### Suggested next steps
{suggested_next_steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

### Files to review
{files_to_check.map(f => `- \`${f}\``).join('\n') || "See the original Claude review for context."}

---

*To continue, address the blocker and push a new commit. I'll pick back up automatically if enabled, or you can complete the fix manually.*

<details>
<summary>Debug info</summary>

- Agent version: {version}
- Loop iterations: {iterations}
- Model used: {model}
- Tokens used: {tokenCount}
- Time elapsed: {elapsedTime}

</details>
```

### Labels Applied

```typescript
async function applyHumanHelpLabels(pr: PullRequest): Promise<void> {
  // Remove "working" label
  await github.issues.removeLabel({
    owner: pr.owner,
    repo: pr.repo,
    issue_number: pr.number,
    name: "grovecoder-working",
  }).catch(() => {}); // Ignore if not present
  
  // Add "needs help" label
  await github.issues.addLabels({
    owner: pr.owner,
    repo: pr.repo,
    issue_number: pr.number,
    labels: ["grovecoder-needs-help"],
  });
}
```

---

## Updated Safety Limits

Based on cost analysis, here are refined limits:

```typescript
const SAFETY_LIMITS = {
  // Iteration limits
  maxLoopIterations: 25,        // Single agentic session
  maxRemediationCycles: 3,      // Full push→review→fix cycles
  maxApiCalls: 50,              // Total Claude API calls
  
  // Token/cost limits
  maxTokensPerCall: 100_000,    // Context window safety
  maxTotalTokens: 500_000,      // Per remediation session
  maxCostPerRemediation: 2.00,  // $2 hard cap (catches runaway Opus usage)
  
  // Time limits  
  maxExecutionTimeMs: 15 * 60 * 1000,  // 15 minutes
  
  // Diff limits
  maxLinesPerFile: 500,
  maxFilesPerCommit: 20,
  maxTotalLines: 1000,
  
  // Stuck detection
  maxConsecutiveFailures: 3,    // Same error 3x = give up
  maxNoProgressIterations: 5,   // 5 iterations with no commits = give up
};
```

---

## Implementation Priority Update

Based on this analysis, here's what should be prioritized:

### Phase 1 Additions (MVP)
- [ ] Prompt caching setup (easy win for cost)
- [ ] Basic review parser (focus on Issues section + Recommendations)
- [ ] Token tracking from API responses

### Phase 2 Additions
- [ ] Full review parser (all sections)
- [ ] Model escalation logic
- [ ] `request_human_help` tool with full context
- [ ] Cost tracking and $2 circuit breaker

---

## Open Questions Resolved

| Question | Answer |
|----------|--------|
| Claude bot username | "Claude" with bot tag - verify exact string in first test |
| Review format | Highly structured (see parser spec above) |
| Default model | Sonnet |
| Escalation to Opus | ~5% of cases (complex/security/stuck) |

---

*Addendum version: 1.0*
*Updated: 2025-12-03*
