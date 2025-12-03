/**
 * Request human help tool
 * Posts a detailed comment explaining blockers and adds needs-help label
 */

import { logger } from '../utils/index.js';
import type { GitHubClient } from '../github/client.js';
import type { RepoContext } from '../github/types.js';
import { LABELS } from '../agent/loop.js';

export interface HumanHelpContext {
  github: GitHubClient;
  repo: RepoContext;
  prNumber: number;
}

export interface HumanHelpRequest {
  /** Summary of what was attempted */
  summary: string;
  /** Specific blockers preventing progress */
  blockers: string[];
  /** Suggested next steps for humans */
  suggestions?: string[];
  /** Issues that were successfully fixed before getting stuck */
  issuesFixed?: number;
  /** Issues that could not be fixed */
  issuesRemaining?: number;
}

/**
 * Request human help by posting a detailed comment and adding label
 */
export async function requestHumanHelp(
  ctx: HumanHelpContext,
  request: HumanHelpRequest
): Promise<string> {
  const { github, repo, prNumber } = ctx;

  logger.info('Requesting human help', {
    prNumber,
    blockers: request.blockers.length,
    issuesFixed: request.issuesFixed,
    issuesRemaining: request.issuesRemaining,
  });

  // Build the help request comment
  const comment = buildHelpRequestComment(request);

  try {
    // Post the comment
    await github.addPRComment(repo, prNumber, comment);

    // Add the needs-help label
    await github.addLabel(repo, prNumber, [LABELS.NEEDS_HELP]);

    // Remove working label if present
    try {
      await github.removeLabel(repo, prNumber, LABELS.WORKING);
    } catch {
      // Ignore if label doesn't exist
    }

    logger.info('Human help requested successfully', { prNumber });

    return 'Help request posted. A human will review and assist.';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to request human help', { error: message });
    throw error;
  }
}

/**
 * Build a formatted help request comment
 */
function buildHelpRequestComment(request: HumanHelpRequest): string {
  let comment = `## :raising_hand: GroveCoder Needs Human Assistance\n\n`;

  // Summary
  comment += `### Summary\n`;
  comment += `${request.summary}\n\n`;

  // Progress (if any)
  if (request.issuesFixed !== undefined || request.issuesRemaining !== undefined) {
    comment += `### Progress\n`;
    if (request.issuesFixed !== undefined) {
      comment += `- **Issues Fixed:** ${request.issuesFixed}\n`;
    }
    if (request.issuesRemaining !== undefined) {
      comment += `- **Issues Remaining:** ${request.issuesRemaining}\n`;
    }
    comment += `\n`;
  }

  // Blockers
  comment += `### Blockers\n`;
  if (request.blockers.length === 0) {
    comment += `_No specific blockers identified._\n\n`;
  } else {
    for (const blocker of request.blockers) {
      comment += `- ${blocker}\n`;
    }
    comment += `\n`;
  }

  // Suggestions
  if (request.suggestions && request.suggestions.length > 0) {
    comment += `### Suggested Actions\n`;
    for (const suggestion of request.suggestions) {
      comment += `- [ ] ${suggestion}\n`;
    }
    comment += `\n`;
  }

  // Footer
  comment += `---\n`;
  comment += `_After resolving the blockers, you can re-trigger GroveCoder by posting a new review comment._`;

  return comment;
}
