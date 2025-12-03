/**
 * Core agentic loop implementation for GroveCoder
 */

import { logger, SafetyLimitError } from '../utils/index.js';
import { ClaudeClient } from '../claude/client.js';
import type { Message } from '../claude/types.js';
import {
  createToolResultMessage,
  createToolResult,
  extractToolUses,
  extractTextContent,
} from '../claude/messages.js';
import { GitHubClient } from '../github/client.js';
import type { RepoContext, PRDetails } from '../github/types.js';
import { executeTools, getToolDefinitions, type ToolContext } from '../tools/index.js';
import { SafetyChecker, createInitialState, updateState } from './safety.js';
import { SYSTEM_PROMPT, buildInitialPrompt } from './prompt.js';
import type { ParsedReview, AgentState } from './types.js';

export interface AgentLoopOptions {
  claude: ClaudeClient;
  github: GitHubClient;
  repo: RepoContext;
  prDetails: PRDetails;
  review: ParsedReview;
  dryRun?: boolean;
}

export interface AgentLoopResult {
  success: boolean;
  state: AgentState;
  summary: string;
  error?: string;
}

export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  const { claude, github, repo, prDetails, review, dryRun = false } = options;

  const safety = new SafetyChecker();
  let state = createInitialState();
  const messages: Message[] = [];
  const fileCache = new Map<string, { content: string; sha: string }>();

  const toolCtx: ToolContext = {
    github,
    repo,
    branch: prDetails.head.ref,
    prNumber: prDetails.number,
    fileCache,
  };

  logger.info('Starting agent loop', {
    prNumber: prDetails.number,
    branch: prDetails.head.ref,
    issueCount: review.issuesAndConcerns.length,
    dryRun,
  });

  // Build initial prompt
  const initialPrompt = buildInitialPrompt(review, prDetails.title, prDetails.head.ref);
  messages.push({ role: 'user', content: initialPrompt });

  try {
    while (!state.isComplete) {
      state = updateState(state, { iteration: state.iteration + 1 });

      // Safety checks
      safety.checkAll(state);
      safety.logStatus(state);

      // Send message to Claude
      const response = await claude.sendMessage(messages, {
        systemPrompt: SYSTEM_PROMPT,
        tools: getToolDefinitions(),
      });

      // Update token usage
      state = updateState(state, {
        totalInputTokens: state.totalInputTokens + response.usage.inputTokens,
        totalOutputTokens: state.totalOutputTokens + response.usage.outputTokens,
      });

      // Extract text and tool uses
      const textContent = extractTextContent(response.content);
      const toolUses = extractToolUses(response.content);

      if (textContent) {
        logger.debug('Claude response', { text: textContent.slice(0, 200) });
      }

      // If no tool uses, Claude is done talking
      if (toolUses.length === 0) {
        logger.info('No tool uses in response, completing');
        state = updateState(state, { isComplete: true, exitReason: 'no_tool_use' });
        break;
      }

      // Add assistant message to history
      messages.push({ role: 'assistant', content: response.content });

      // Execute tools
      const results = await executeTools(toolUses, toolCtx);

      // Build tool result message
      const toolResults = toolUses.map((tu) => {
        const result = results.get(tu.id);
        if (!result) {
          return createToolResult(tu.id, 'Tool execution failed: no result', true);
        }
        return createToolResult(tu.id, result.output, !result.success);
      });

      messages.push(createToolResultMessage(toolResults));

      // Check for completion via 'done' tool
      for (const result of results.values()) {
        if (result.isDone) {
          state = updateState(state, {
            isComplete: true,
            exitReason: 'done_tool',
            fixedIssues: result.summary?.issuesFixed ?? state.fixedIssues,
            failedIssues: result.summary?.issuesSkipped ?? state.failedIssues,
          });
          break;
        }

        // Track progress if tool succeeded
        if (result.success) {
          state = updateState(state, { lastProgress: state.iteration });
        }
      }

      // Check for end_turn stop reason
      if (response.stopReason === 'end_turn' && toolUses.length === 0) {
        state = updateState(state, { isComplete: true, exitReason: 'end_turn' });
      }
    }

    const summary = buildSummary(state, review);

    logger.info('Agent loop completed', {
      iterations: state.iteration,
      fixedIssues: state.fixedIssues,
      failedIssues: state.failedIssues,
      exitReason: state.exitReason,
    });

    return {
      success: true,
      state,
      summary,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const exitReason = error instanceof SafetyLimitError ? `safety_${error.limitType}` : 'error';

    state = updateState(state, { isComplete: true, exitReason });

    logger.error('Agent loop failed', {
      error: errorMessage,
      iteration: state.iteration,
      exitReason,
    });

    return {
      success: false,
      state,
      summary: buildSummary(state, review),
      error: errorMessage,
    };
  }
}

function buildSummary(state: AgentState, review: ParsedReview): string {
  const totalIssues = review.issuesAndConcerns.length;
  const elapsed = Math.round((Date.now() - state.startTime) / 1000);

  let summary = `## GroveCoder Summary\n\n`;
  summary += `- **Issues Fixed:** ${state.fixedIssues}/${totalIssues}\n`;
  summary += `- **Issues Skipped:** ${state.failedIssues}\n`;
  summary += `- **Iterations:** ${state.iteration}\n`;
  summary += `- **Time Elapsed:** ${elapsed}s\n`;

  if (state.exitReason) {
    summary += `- **Exit Reason:** ${state.exitReason}\n`;
  }

  if (state.failedIssues > 0) {
    summary += `\n### Manual Review Needed\n`;
    summary += `Some issues could not be fixed automatically. Please review the remaining feedback.\n`;
  }

  return summary;
}
