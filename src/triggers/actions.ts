/**
 * GitHub Actions trigger handler for GroveCoder
 */

import { logger, ConfigError } from '../utils/index.js';
import { ClaudeClient } from '../claude/client.js';
import { GitHubClient } from '../github/client.js';
import type { RepoContext } from '../github/types.js';
import { isClaudeReview, parseClaudeReview, validateReview } from '../agent/parser.js';
import { runAgentLoop } from '../agent/loop.js';

export interface ActionsContext {
  repository: string; // owner/repo format
  prNumber: number;
  commentId: number;
  commentBody: string;
  prBranch: string;
}

function parseActionsContext(): ActionsContext {
  const repository = process.env['GITHUB_REPOSITORY'];
  const prNumberStr = process.env['PR_NUMBER'];
  const commentIdStr = process.env['COMMENT_ID'];
  const commentBody = process.env['COMMENT_BODY'];
  const prBranch = process.env['PR_BRANCH'];

  if (!repository) {
    throw new ConfigError('GITHUB_REPOSITORY environment variable is required');
  }

  if (!prNumberStr) {
    throw new ConfigError('PR_NUMBER environment variable is required');
  }

  const prNumber = parseInt(prNumberStr, 10);
  if (isNaN(prNumber)) {
    throw new ConfigError('PR_NUMBER must be a valid number');
  }

  if (!commentIdStr) {
    throw new ConfigError('COMMENT_ID environment variable is required');
  }

  const commentId = parseInt(commentIdStr, 10);
  if (isNaN(commentId)) {
    throw new ConfigError('COMMENT_ID must be a valid number');
  }

  if (!commentBody) {
    throw new ConfigError('COMMENT_BODY environment variable is required');
  }

  if (!prBranch) {
    throw new ConfigError('PR_BRANCH environment variable is required');
  }

  return {
    repository,
    prNumber,
    commentId,
    commentBody,
    prBranch,
  };
}

function parseRepoContext(repository: string): RepoContext {
  const [owner, repo] = repository.split('/');
  if (!owner || !repo) {
    throw new ConfigError(`Invalid repository format: ${repository}`);
  }
  return { owner, repo };
}

export async function handleActionsEvent(): Promise<void> {
  logger.info('GroveCoder Actions handler starting');

  // Parse context from environment
  const ctx = parseActionsContext();
  const repo = parseRepoContext(ctx.repository);

  logger.info('Processing PR comment', {
    repository: ctx.repository,
    prNumber: ctx.prNumber,
    commentId: ctx.commentId,
  });

  // Check if this is a Claude review comment
  if (!isClaudeReview(ctx.commentBody)) {
    logger.info('Comment does not appear to be a Claude review, skipping');
    return;
  }

  // Parse the review
  const review = parseClaudeReview(ctx.commentBody);

  try {
    validateReview(review);
  } catch (error) {
    logger.info('Review validation failed, skipping', {
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  logger.info('Parsed Claude review', {
    issueCount: review.issuesAndConcerns.length,
    recommendation: review.finalRecommendation,
    complexity: review.complexityEstimate,
  });

  // Initialize clients
  const claude = new ClaudeClient();
  const github = new GitHubClient();

  // Get PR details
  const prDetails = await github.getPRDetails(repo, ctx.prNumber);

  // Post starting comment
  await github.addPRComment(repo, ctx.prNumber,
    `## GroveCoder Starting\n\nI'm analyzing the review feedback and will attempt to fix the identified issues.\n\n- **Issues Found:** ${review.issuesAndConcerns.length}\n- **Complexity:** ${review.complexityEstimate}`
  );

  // Run the agent loop
  const dryRun = process.env['GROVECODER_DRY_RUN'] === 'true';
  const result = await runAgentLoop({
    claude,
    github,
    repo,
    prDetails,
    review,
    dryRun,
  });

  // Post summary comment
  await github.addPRComment(repo, ctx.prNumber, result.summary);

  if (result.success) {
    logger.info('GroveCoder completed successfully');
  } else {
    logger.error('GroveCoder completed with errors', { error: result.error });
    process.exitCode = 1;
  }
}
