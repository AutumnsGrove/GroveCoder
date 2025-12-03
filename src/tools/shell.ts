/**
 * Shell command execution tools
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger, ToolExecutionError } from '../utils/index.js';

const execAsync = promisify(exec);

const ALLOWED_COMMANDS = [
  'npm test',
  'npm run test',
  'npm run lint',
  'npm run typecheck',
  'npm run build',
  'npx tsc --noEmit',
  'npx eslint',
  'npx vitest run',
  'cargo test',
  'cargo clippy',
  'cargo check',
  'go test',
  'go vet',
  'pytest',
  'ruff check',
  'mypy',
  'git status',
  'git diff',
  'git log',
];

const COMMAND_TIMEOUT_MS = 60_000; // 1 minute

const DANGEROUS_OPERATORS = ['&&', '||', ';', '|', '`', '$(' , '>' , '<', '>>'];

function containsDangerousOperators(command: string): boolean {
  return DANGEROUS_OPERATORS.some((op) => command.includes(op));
}

function isCommandAllowed(command: string): boolean {
  const normalized = command.trim().toLowerCase();

  // Reject commands with shell operators that could chain malicious commands
  if (containsDangerousOperators(command)) {
    return false;
  }

  // Check exact matches
  if (ALLOWED_COMMANDS.some((allowed) => normalized === allowed.toLowerCase())) {
    return true;
  }

  // Check prefix matches (e.g., "npm test -- specific-file")
  if (
    ALLOWED_COMMANDS.some((allowed) =>
      normalized.startsWith(allowed.toLowerCase() + ' ')
    )
  ) {
    return true;
  }

  // Allow git commands with flags
  if (normalized.startsWith('git status') || normalized.startsWith('git diff') || normalized.startsWith('git log')) {
    return true;
  }

  return false;
}

export async function runCommand(
  command: string,
  cwd?: string
): Promise<string> {
  logger.debug('run_command', { command, cwd });

  if (!isCommandAllowed(command)) {
    throw new ToolExecutionError(
      `Command not allowed: "${command}". Only whitelisted commands are permitted for safety.`,
      'run_command',
      false
    );
  }

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: cwd ?? process.cwd(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: 1024 * 1024, // 1MB
    });

    const output = [stdout, stderr].filter(Boolean).join('\n---stderr---\n');
    return output || 'Command completed with no output';
  } catch (error) {
    // exec errors include stdout/stderr in the error object
    const execError = error as { stdout?: string; stderr?: string; code?: number; message?: string };

    const output = [execError.stdout, execError.stderr].filter(Boolean).join('\n');

    if (execError.code !== undefined) {
      // Non-zero exit code - return output with error indicator
      return `Command exited with code ${execError.code}:\n${output}`;
    }

    throw new ToolExecutionError(
      `Command failed: ${execError.message ?? String(error)}\n${output}`,
      'run_command'
    );
  }
}

export async function gitStatus(): Promise<string> {
  return runCommand('git status --porcelain');
}

export async function gitDiff(staged = false): Promise<string> {
  const command = staged ? 'git diff --cached' : 'git diff';
  return runCommand(command);
}
