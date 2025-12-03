/**
 * File operation tools implementation
 */

import { GitHubClient } from '../github/client.js';
import type { RepoContext } from '../github/types.js';
import { logger, ToolExecutionError } from '../utils/index.js';

export interface FileOpsContext {
  github: GitHubClient;
  repo: RepoContext;
  branch: string;
  fileCache: Map<string, { content: string; sha: string }>;
}

export async function readFile(
  ctx: FileOpsContext,
  path: string
): Promise<string> {
  logger.debug('read_file', { path });

  // Check cache first
  const cached = ctx.fileCache.get(path);
  if (cached) {
    return cached.content;
  }

  try {
    const file = await ctx.github.getFileContent(ctx.repo, path, ctx.branch);
    ctx.fileCache.set(path, { content: file.content, sha: file.sha ?? '' });
    return file.content;
  } catch (error) {
    throw new ToolExecutionError(
      `Failed to read file ${path}: ${error instanceof Error ? error.message : String(error)}`,
      'read_file'
    );
  }
}

export async function writeFile(
  ctx: FileOpsContext,
  path: string,
  content: string
): Promise<string> {
  logger.debug('write_file', { path, contentLength: content.length });

  try {
    // Get existing file SHA if it exists
    let sha: string | undefined;
    const cached = ctx.fileCache.get(path);

    if (cached) {
      sha = cached.sha;
    } else {
      try {
        const existing = await ctx.github.getFileContent(ctx.repo, path, ctx.branch);
        sha = existing.sha;
      } catch {
        // File doesn't exist, that's fine for new files
      }
    }

    const result = await ctx.github.createOrUpdateFile(ctx.repo, path, {
      message: `fix: update ${path}`,
      content,
      branch: ctx.branch,
      sha,
    });

    // Update cache
    ctx.fileCache.set(path, { content, sha: result.sha });

    return `Successfully wrote ${content.length} bytes to ${path}`;
  } catch (error) {
    throw new ToolExecutionError(
      `Failed to write file ${path}: ${error instanceof Error ? error.message : String(error)}`,
      'write_file'
    );
  }
}

export async function editFile(
  ctx: FileOpsContext,
  path: string,
  oldString: string,
  newString: string
): Promise<string> {
  logger.debug('edit_file', { path, oldStringLength: oldString.length });

  try {
    const content = await readFile(ctx, path);

    if (!content.includes(oldString)) {
      throw new ToolExecutionError(
        `Could not find the specified string in ${path}. Make sure to use the exact string including whitespace.`,
        'edit_file'
      );
    }

    const occurrences = content.split(oldString).length - 1;
    if (occurrences > 1) {
      throw new ToolExecutionError(
        `Found ${occurrences} occurrences of the string in ${path}. Please provide a more specific string to match exactly once.`,
        'edit_file'
      );
    }

    const newContent = content.replace(oldString, newString);
    return await writeFile(ctx, path, newContent);
  } catch (error) {
    if (error instanceof ToolExecutionError) throw error;
    throw new ToolExecutionError(
      `Failed to edit file ${path}: ${error instanceof Error ? error.message : String(error)}`,
      'edit_file'
    );
  }
}

export async function listDirectory(
  ctx: FileOpsContext,
  path: string
): Promise<string> {
  logger.debug('list_directory', { path });

  try {
    const normalizedPath = path === '.' ? '' : path;
    const entries = await ctx.github.listDirectory(ctx.repo, normalizedPath, ctx.branch);

    const formatted = entries
      .map((e) => {
        const icon = e.type === 'dir' ? '📁' : '📄';
        const size = e.size !== undefined ? ` (${e.size} bytes)` : '';
        return `${icon} ${e.name}${size}`;
      })
      .join('\n');

    return formatted || 'Directory is empty';
  } catch (error) {
    throw new ToolExecutionError(
      `Failed to list directory ${path}: ${error instanceof Error ? error.message : String(error)}`,
      'list_directory'
    );
  }
}
