/**
 * File search tools implementation
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger, ToolExecutionError } from '../utils/index.js';

const execAsync = promisify(exec);

const MAX_RESULTS = 50;

/**
 * Escape a string for safe use in single-quoted shell arguments.
 * Also rejects dangerous characters that shouldn't appear in search patterns.
 *
 * @throws ToolExecutionError if the argument contains dangerous characters
 */
function escapeShellArg(arg: string, paramName: string): string {
  // Reject null bytes - these can truncate strings in C-based programs
  if (arg.includes('\0')) {
    throw new ToolExecutionError(
      `${paramName} cannot contain null bytes`,
      'search_files',
      false
    );
  }

  // Reject newlines and carriage returns - these can break out of commands
  if (/[\r\n]/.test(arg)) {
    throw new ToolExecutionError(
      `${paramName} cannot contain newline characters`,
      'search_files',
      false
    );
  }

  // Escape single quotes for use inside single-quoted string
  // 'foo'bar' becomes 'foo'\''bar'
  return arg.replace(/'/g, "'\\''");
}

/**
 * Validate and sanitize file pattern to prevent shell injection.
 * Only allows safe glob characters.
 */
function validateFilePattern(pattern: string): string {
  // Allow only alphanumeric, dots, dashes, underscores, asterisks, and question marks
  // This covers legitimate glob patterns like *.ts, *.{js,jsx}, test-*.ts
  const safePattern = /^[a-zA-Z0-9.*?\-_,{}[\]]+$/;

  if (!safePattern.test(pattern)) {
    throw new ToolExecutionError(
      `Invalid file pattern: "${pattern}". Only alphanumeric characters and glob wildcards (*, ?, [], {}) are allowed.`,
      'search_files',
      false
    );
  }

  return pattern;
}

/**
 * Validate search path to prevent path traversal attacks.
 */
function validateSearchPath(searchPath: string): string {
  // Reject path traversal attempts
  if (searchPath.includes('..')) {
    throw new ToolExecutionError(
      'Search path cannot contain ".." (path traversal)',
      'search_files',
      false
    );
  }

  // Reject absolute paths outside expected directories
  if (searchPath.startsWith('/') && !searchPath.startsWith(process.cwd())) {
    throw new ToolExecutionError(
      'Search path must be within the working directory',
      'search_files',
      false
    );
  }

  return searchPath;
}

export async function searchFiles(
  pattern: string,
  path?: string,
  filePattern?: string
): Promise<string> {
  logger.debug('search_files', { pattern, path, filePattern });

  try {
    // Validate and escape all inputs
    const escapedPattern = escapeShellArg(pattern, 'pattern');

    const safeFilePattern = filePattern
      ? validateFilePattern(filePattern)
      : '*';

    // Build grep command with properly escaped arguments
    let command = `grep -rn --include='${safeFilePattern}' '${escapedPattern}'`;

    if (path) {
      const validatedPath = validateSearchPath(path);
      const escapedPath = escapeShellArg(validatedPath, 'path');
      command += ` '${escapedPath}'`;
    } else {
      command += ' .';
    }

    // Limit results
    command += ` | head -n ${MAX_RESULTS}`;

    const { stdout } = await execAsync(command, {
      cwd: process.cwd(),
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });

    if (!stdout.trim()) {
      return 'No matches found';
    }

    const lines = stdout.trim().split('\n');
    const resultCount = lines.length;
    const truncated = resultCount >= MAX_RESULTS;

    let result = lines.join('\n');

    if (truncated) {
      result += `\n\n... (showing first ${MAX_RESULTS} results)`;
    }

    return result;
  } catch (error) {
    // Re-throw our validation errors
    if (error instanceof ToolExecutionError) {
      throw error;
    }

    const execError = error as { code?: number; stdout?: string; message?: string };

    // grep returns exit code 1 when no matches found
    if (execError.code === 1 && !execError.stdout) {
      return 'No matches found';
    }

    throw new ToolExecutionError(
      `Search failed: ${execError.message ?? String(error)}`,
      'search_files'
    );
  }
}
