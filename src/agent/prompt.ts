/**
 * System prompt and context building for GroveCoder agent
 */

import type { ParsedReview } from './types.js';

export const SYSTEM_PROMPT = `You are GroveCoder, an autonomous PR remediation agent. Your job is to fix issues identified in code review comments.

## Your Capabilities
You have access to tools for:
- Reading and writing files in the repository
- Running tests, linters, and type checkers
- Searching the codebase
- Getting PR information and posting comments

## Guidelines

### General
1. Fix issues one at a time, starting with critical issues
2. After each fix, verify it works (run relevant tests/lints if available)
3. Be precise with edits - use edit_file for targeted changes, not write_file
4. Don't make changes beyond what's requested in the review

### Safety
1. Never modify files outside the scope of the PR
2. Never commit secrets, credentials, or sensitive data
3. Don't modify workflow files (.github/workflows/*)
4. If unsure about a fix, skip it and note why

### Communication
1. Use add_pr_comment to post status updates for long-running tasks
2. When done, call the 'done' tool with a summary

### When to Stop
Call the 'done' tool when:
- All issues have been addressed
- You've made reasonable attempts but can't fix remaining issues
- You need human intervention

Be thorough but efficient. Quality fixes are more important than speed.`;

export function buildInitialPrompt(
  review: ParsedReview,
  prTitle: string,
  prBranch: string
): string {
  const issuesList = review.issuesAndConcerns
    .map((issue, i) => {
      let entry = `${i + 1}. [${issue.severity.toUpperCase()}] ${issue.title}`;
      if (issue.filePath) {
        entry += `\n   File: ${issue.filePath}`;
        if (issue.lineStart) {
          entry += `:${issue.lineStart}`;
          if (issue.lineEnd && issue.lineEnd !== issue.lineStart) {
            entry += `-${issue.lineEnd}`;
          }
        }
      }
      if (issue.description) {
        entry += `\n   ${issue.description}`;
      }
      if (issue.suggestedFix) {
        entry += `\n   Suggested fix:\n   \`\`\`\n   ${issue.suggestedFix}\n   \`\`\``;
      }
      return entry;
    })
    .join('\n\n');

  const recsList = review.recommendations.length > 0
    ? '\n\n## Additional Recommendations\n' + review.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')
    : '';

  return `# PR Remediation Task

## PR Information
- **Title:** ${prTitle}
- **Branch:** ${prBranch}
- **Review Verdict:** ${review.finalRecommendation}
- **Estimated Complexity:** ${review.complexityEstimate}

## Issues to Fix

${issuesList}
${recsList}

## Instructions

Please fix the issues listed above. Start by reading the relevant files, then make the necessary changes. After fixing critical and major issues, run any available tests to verify your changes.

Begin by examining the most critical issues first.`;
}

export function buildFollowUpPrompt(
  iteration: number,
  fixedCount: number,
  remainingIssues: number
): string {
  return `Continue fixing the remaining issues. Progress so far: ${fixedCount} fixed, ${remainingIssues} remaining. (Iteration ${iteration})`;
}
