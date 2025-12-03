/**
 * File search tools implementation
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger, ToolExecutionError } from '../utils/index.js';

const execAsync = promisify(exec);

const MAX_RESULTS = 50;

export async function searchFiles(
  pattern: string,
  path?: string,
  filePattern?: string
): Promise<string> {
  logger.debug('search_files', { pattern, path, filePattern });

  try {
    // Build grep command
    let command = `grep -rn --include='${filePattern ?? '*'}' '${escapeShellArg(pattern)}'`;

    if (path) {
      command += ` '${escapeShellArg(path)}'`;
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

function escapeShellArg(arg: string): string {
  return arg.replace(/'/g, "'\\''");
}
