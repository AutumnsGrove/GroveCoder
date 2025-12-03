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

/**
 * Shell operators and characters that could be used for command injection.
 * These are checked as substrings in the command.
 */
const DANGEROUS_OPERATORS = [
  // Command chaining
  '&&',      // AND operator
  '||',      // OR operator
  ';',       // Command separator
  '|',       // Pipe

  // Command substitution
  '`',       // Backtick substitution
  '$(',      // Modern substitution
  '${',      // Parameter expansion

  // Redirection
  '>',       // Output redirect
  '<',       // Input redirect
  '>>',      // Append redirect

  // Process substitution
  '<(',      // Process substitution input
  '>(',      // Process substitution output
];

/**
 * Characters that should never appear in commands (indicate injection attempts)
 */
const FORBIDDEN_CHARACTERS = [
  '\0',      // Null byte
  '\n',      // Newline
  '\r',      // Carriage return
  '\x1b',    // Escape character (ANSI sequences)
];

/**
 * Check if command contains dangerous shell operators or characters
 */
function containsDangerousContent(command: string): { dangerous: boolean; reason?: string } {
  // Check for forbidden characters first
  for (const char of FORBIDDEN_CHARACTERS) {
    if (command.includes(char)) {
      const charName = {
        '\0': 'null byte',
        '\n': 'newline',
        '\r': 'carriage return',
        '\x1b': 'escape character',
      }[char] ?? 'forbidden character';
      return { dangerous: true, reason: `Command contains ${charName}` };
    }
  }

  // Check for dangerous operators
  for (const op of DANGEROUS_OPERATORS) {
    if (command.includes(op)) {
      return { dangerous: true, reason: `Command contains shell operator: ${op}` };
    }
  }

  return { dangerous: false };
}

/**
 * Validate command arguments after the base command.
 * Only allows safe argument patterns.
 */
function validateCommandArguments(args: string): boolean {
  // Arguments should only contain safe characters:
  // - Alphanumeric
  // - Dashes, underscores, dots
  // - Equals (for --flag=value)
  // - Colons (for test filters like test:unit)
  // - Slashes (for paths)
  // - Spaces (between arguments)
  // - Quotes (for quoted strings) - but we still check for dangerous content inside
  const safeArgsPattern = /^[\w\s\-_.=:/"'@,]+$/;

  if (!safeArgsPattern.test(args)) {
    return false;
  }

  return true;
}

function isCommandAllowed(command: string): boolean {
  const trimmed = command.trim();
  const normalized = trimmed.toLowerCase();

  // Check for dangerous operators/characters first
  const { dangerous, reason } = containsDangerousContent(trimmed);
  if (dangerous) {
    logger.debug('Command rejected', { command: trimmed, reason });
    return false;
  }

  // Check exact matches
  if (ALLOWED_COMMANDS.some((allowed) => normalized === allowed.toLowerCase())) {
    return true;
  }

  // Check prefix matches with argument validation
  for (const allowed of ALLOWED_COMMANDS) {
    const prefix = allowed.toLowerCase() + ' ';
    if (normalized.startsWith(prefix)) {
      const args = trimmed.slice(allowed.length + 1);
      if (validateCommandArguments(args)) {
        return true;
      } else {
        logger.debug('Command arguments rejected', { command: trimmed, args });
        return false;
      }
    }
  }

  // Allow git commands with flags (with argument validation)
  const gitPrefixes = ['git status', 'git diff', 'git log'];
  for (const prefix of gitPrefixes) {
    if (normalized === prefix) {
      return true;
    }
    if (normalized.startsWith(prefix + ' ')) {
      const args = trimmed.slice(prefix.length + 1);
      if (validateCommandArguments(args)) {
        return true;
      }
    }
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

  // Validate cwd if provided
  if (cwd) {
    // Prevent path traversal in cwd
    if (cwd.includes('..')) {
      throw new ToolExecutionError(
        'Working directory cannot contain ".." (path traversal)',
        'run_command',
        false
      );
    }
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
