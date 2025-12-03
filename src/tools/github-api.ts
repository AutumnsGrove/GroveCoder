/**
 * GitHub API tools implementation
 */

import { GitHubClient } from '../github/client.js';
import type { RepoContext } from '../github/types.js';
import { logger, ToolExecutionError } from '../utils/index.js';

export interface GitHubToolsContext {
  github: GitHubClient;
  repo: RepoContext;
  prNumber: number;
}

export async function getPrDiff(ctx: GitHubToolsContext): Promise<string> {
  logger.debug('get_pr_diff', { prNumber: ctx.prNumber });

  try {
    const files = await ctx.github.getPRDiff(ctx.repo, ctx.prNumber);

    if (files.length === 0) {
      return 'No files changed in this PR';
    }

    const formatted = files
      .map((f) => {
        const statusIcon = {
          added: '➕',
          removed: '➖',
          modified: '📝',
          renamed: '📛',
          copied: '📋',
          changed: '📝',
          unchanged: '⬜',
        }[f.status];

        let entry = `${statusIcon} ${f.filename} (+${f.additions}/-${f.deletions})`;

        if (f.patch) {
          // Truncate very long patches
          const patch = f.patch.length > 2000 ? f.patch.slice(0, 2000) + '\n... (truncated)' : f.patch;
          entry += `\n\`\`\`diff\n${patch}\n\`\`\``;
        }

        return entry;
      })
      .join('\n\n');

    return formatted;
  } catch (error) {
    throw new ToolExecutionError(
      `Failed to get PR diff: ${error instanceof Error ? error.message : String(error)}`,
      'get_pr_diff'
    );
  }
}

export async function getPrComments(ctx: GitHubToolsContext): Promise<string> {
  logger.debug('get_pr_comments', { prNumber: ctx.prNumber });

  try {
    const comments = await ctx.github.getPRComments(ctx.repo, ctx.prNumber);

    if (comments.length === 0) {
      return 'No comments on this PR';
    }

    const formatted = comments
      .map((c) => {
        const date = new Date(c.createdAt).toLocaleString();
        return `**${c.user.login}** (${date}):\n${c.body}`;
      })
      .join('\n\n---\n\n');

    return formatted;
  } catch (error) {
    throw new ToolExecutionError(
      `Failed to get PR comments: ${error instanceof Error ? error.message : String(error)}`,
      'get_pr_comments'
    );
  }
}

export async function addPrComment(
  ctx: GitHubToolsContext,
  body: string
): Promise<string> {
  logger.debug('add_pr_comment', { prNumber: ctx.prNumber, bodyLength: body.length });

  try {
    const comment = await ctx.github.addPRComment(ctx.repo, ctx.prNumber, body);
    return `Comment posted successfully (ID: ${comment.id})`;
  } catch (error) {
    throw new ToolExecutionError(
      `Failed to add PR comment: ${error instanceof Error ? error.message : String(error)}`,
      'add_pr_comment'
    );
  }
}
