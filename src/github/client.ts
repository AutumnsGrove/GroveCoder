/**
 * GitHub API client wrapper for GroveCoder
 */

import { Octokit } from '@octokit/rest';
import { logger, withRetry, ApiError, ConfigError } from '../utils/index.js';
import type {
  RepoContext,
  PRContext,
  FileContent,
  PRComment,
  PRDetails,
  PRDiff,
  DirectoryEntry,
  CreateFileOptions,
} from './types.js';

export interface GitHubClientOptions {
  token?: string;
}

export class GitHubClient {
  private octokit: Octokit;

  constructor(options: GitHubClientOptions = {}) {
    const token = options.token ?? process.env['GITHUB_TOKEN'];

    if (!token) {
      throw new ConfigError('GITHUB_TOKEN is required');
    }

    this.octokit = new Octokit({ auth: token });
  }

  async getFileContent(ctx: RepoContext, path: string, ref?: string): Promise<FileContent> {
    logger.debug('Getting file content', { ...ctx, path, ref });

    return withRetry(async () => {
      try {
        const response = await this.octokit.repos.getContent({
          owner: ctx.owner,
          repo: ctx.repo,
          path,
          ref,
        });

        const data = response.data;

        if (Array.isArray(data) || data.type !== 'file') {
          throw new ApiError(`Path ${path} is not a file`, 400, 'github');
        }

        const content =
          data.encoding === 'base64' ? Buffer.from(data.content, 'base64').toString('utf-8') : data.content;

        return {
          path: data.path,
          content,
          sha: data.sha,
        };
      } catch (error) {
        if (error instanceof ApiError) throw error;
        const message = error instanceof Error ? error.message : String(error);
        throw new ApiError(`Failed to get file: ${message}`, undefined, 'github');
      }
    });
  }

  async createOrUpdateFile(
    ctx: RepoContext,
    path: string,
    options: CreateFileOptions
  ): Promise<{ sha: string; committed: boolean }> {
    logger.debug('Creating/updating file', { ...ctx, path, hasExistingSha: !!options.sha });

    return withRetry(async () => {
      try {
        const response = await this.octokit.repos.createOrUpdateFileContents({
          owner: ctx.owner,
          repo: ctx.repo,
          path,
          message: options.message,
          content: Buffer.from(options.content).toString('base64'),
          branch: options.branch,
          sha: options.sha,
        });

        return {
          sha: response.data.content?.sha ?? '',
          committed: true,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new ApiError(`Failed to update file: ${message}`, undefined, 'github');
      }
    });
  }

  async listDirectory(ctx: RepoContext, path: string, ref?: string): Promise<DirectoryEntry[]> {
    logger.debug('Listing directory', { ...ctx, path, ref });

    return withRetry(async () => {
      try {
        const response = await this.octokit.repos.getContent({
          owner: ctx.owner,
          repo: ctx.repo,
          path,
          ref,
        });

        const data = response.data;

        if (!Array.isArray(data)) {
          throw new ApiError(`Path ${path} is not a directory`, 400, 'github');
        }

        return data.map((item) => ({
          name: item.name,
          path: item.path,
          type: item.type as DirectoryEntry['type'],
          sha: item.sha,
          size: item.size,
        }));
      } catch (error) {
        if (error instanceof ApiError) throw error;
        const message = error instanceof Error ? error.message : String(error);
        throw new ApiError(`Failed to list directory: ${message}`, undefined, 'github');
      }
    });
  }

  async getPRDetails(ctx: RepoContext, prNumber: number): Promise<PRDetails> {
    logger.debug('Getting PR details', { ...ctx, prNumber });

    return withRetry(async () => {
      try {
        const response = await this.octokit.pulls.get({
          owner: ctx.owner,
          repo: ctx.repo,
          pull_number: prNumber,
        });

        const pr = response.data;

        return {
          number: pr.number,
          title: pr.title,
          body: pr.body,
          state: pr.state as 'open' | 'closed',
          head: {
            ref: pr.head.ref,
            sha: pr.head.sha,
          },
          base: {
            ref: pr.base.ref,
            sha: pr.base.sha,
          },
          user: {
            login: pr.user?.login ?? 'unknown',
          },
          draft: pr.draft ?? false,
          mergeable: pr.mergeable,
          changedFiles: pr.changed_files,
          additions: pr.additions,
          deletions: pr.deletions,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new ApiError(`Failed to get PR details: ${message}`, undefined, 'github');
      }
    });
  }

  async getPRDiff(ctx: RepoContext, prNumber: number): Promise<PRDiff[]> {
    logger.debug('Getting PR diff', { ...ctx, prNumber });

    return withRetry(async () => {
      try {
        const response = await this.octokit.pulls.listFiles({
          owner: ctx.owner,
          repo: ctx.repo,
          pull_number: prNumber,
          per_page: 100,
        });

        return response.data.map((file) => ({
          filename: file.filename,
          status: file.status as PRDiff['status'],
          additions: file.additions,
          deletions: file.deletions,
          patch: file.patch,
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new ApiError(`Failed to get PR diff: ${message}`, undefined, 'github');
      }
    });
  }

  async getPRComments(ctx: RepoContext, prNumber: number): Promise<PRComment[]> {
    logger.debug('Getting PR comments', { ...ctx, prNumber });

    return withRetry(async () => {
      try {
        const response = await this.octokit.issues.listComments({
          owner: ctx.owner,
          repo: ctx.repo,
          issue_number: prNumber,
          per_page: 100,
        });

        return response.data.map((comment) => ({
          id: comment.id,
          body: comment.body ?? '',
          user: {
            login: comment.user?.login ?? 'unknown',
            type: comment.user?.type ?? 'User',
          },
          createdAt: comment.created_at,
          updatedAt: comment.updated_at,
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new ApiError(`Failed to get PR comments: ${message}`, undefined, 'github');
      }
    });
  }

  async addPRComment(ctx: RepoContext, prNumber: number, body: string): Promise<PRComment> {
    logger.debug('Adding PR comment', { ...ctx, prNumber, bodyLength: body.length });

    return withRetry(async () => {
      try {
        const response = await this.octokit.issues.createComment({
          owner: ctx.owner,
          repo: ctx.repo,
          issue_number: prNumber,
          body,
        });

        return {
          id: response.data.id,
          body: response.data.body ?? '',
          user: {
            login: response.data.user?.login ?? 'unknown',
            type: response.data.user?.type ?? 'Bot',
          },
          createdAt: response.data.created_at,
          updatedAt: response.data.updated_at,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new ApiError(`Failed to add PR comment: ${message}`, undefined, 'github');
      }
    });
  }

  async updatePRComment(ctx: RepoContext, commentId: number, body: string): Promise<void> {
    logger.debug('Updating PR comment', { ...ctx, commentId });

    await withRetry(async () => {
      try {
        await this.octokit.issues.updateComment({
          owner: ctx.owner,
          repo: ctx.repo,
          comment_id: commentId,
          body,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new ApiError(`Failed to update PR comment: ${message}`, undefined, 'github');
      }
    });
  }

  async addLabel(ctx: RepoContext, prNumber: number, labels: string[]): Promise<void> {
    logger.debug('Adding labels', { ...ctx, prNumber, labels });

    await withRetry(async () => {
      try {
        await this.octokit.issues.addLabels({
          owner: ctx.owner,
          repo: ctx.repo,
          issue_number: prNumber,
          labels,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new ApiError(`Failed to add labels: ${message}`, undefined, 'github');
      }
    });
  }

  async removeLabel(ctx: RepoContext, prNumber: number, label: string): Promise<void> {
    logger.debug('Removing label', { ...ctx, prNumber, label });

    await withRetry(async () => {
      try {
        await this.octokit.issues.removeLabel({
          owner: ctx.owner,
          repo: ctx.repo,
          issue_number: prNumber,
          name: label,
        });
      } catch (error) {
        // Ignore 404 (label doesn't exist)
        if (error instanceof Error && error.message.includes('404')) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new ApiError(`Failed to remove label: ${message}`, undefined, 'github');
      }
    });
  }

  createPRContext(ctx: RepoContext, prDetails: PRDetails): PRContext {
    return {
      ...ctx,
      prNumber: prDetails.number,
      branch: prDetails.head.ref,
      baseBranch: prDetails.base.ref,
      headSha: prDetails.head.sha,
    };
  }

  /**
   * Create a GitHub Check Run (shows in PR status section)
   */
  async createCheckRun(
    ctx: RepoContext,
    name: string,
    headSha: string,
    status: 'queued' | 'in_progress' | 'completed' = 'in_progress'
  ): Promise<number> {
    logger.debug('Creating check run', { ...ctx, name, headSha, status });

    return withRetry(async () => {
      try {
        const response = await this.octokit.checks.create({
          owner: ctx.owner,
          repo: ctx.repo,
          name,
          head_sha: headSha,
          status,
          started_at: new Date().toISOString(),
        });

        logger.info('Check run created', { checkRunId: response.data.id });
        return response.data.id;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new ApiError(`Failed to create check run: ${message}`, undefined, 'github');
      }
    });
  }

  /**
   * Update a GitHub Check Run with progress
   */
  async updateCheckRun(
    ctx: RepoContext,
    checkRunId: number,
    updates: {
      status?: 'queued' | 'in_progress' | 'completed';
      conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required';
      output?: {
        title: string;
        summary: string;
        text?: string;
      };
    }
  ): Promise<void> {
    logger.debug('Updating check run', { ...ctx, checkRunId, updates });

    return withRetry(async () => {
      try {
        await this.octokit.checks.update({
          owner: ctx.owner,
          repo: ctx.repo,
          check_run_id: checkRunId,
          ...updates,
          ...(updates.status === 'completed' && {
            completed_at: new Date().toISOString(),
          }),
        });

        logger.info('Check run updated', { checkRunId, status: updates.status });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new ApiError(`Failed to update check run: ${message}`, undefined, 'github');
      }
    });
  }
}
