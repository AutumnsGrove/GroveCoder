/**
 * Tool schema definitions for Claude API
 */

import type { ToolDefinition } from '../claude/types.js';

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'read_file',
    description:
      'Read the contents of a file from the repository. Returns the file content as a string.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path to the file relative to the repository root',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description:
      'Create or overwrite a file in the repository. Use this for creating new files or completely replacing file contents.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path to the file relative to the repository root',
        },
        content: {
          type: 'string',
          description: 'The complete content to write to the file',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description:
      'Make targeted edits to a file using search and replace. Preferred over write_file for modifying existing files.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path to the file relative to the repository root',
        },
        old_string: {
          type: 'string',
          description: 'The exact string to search for and replace',
        },
        new_string: {
          type: 'string',
          description: 'The string to replace old_string with',
        },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
  {
    name: 'list_directory',
    description: 'List the contents of a directory in the repository.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'The path to the directory relative to the repository root. Use "." for root.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'search_files',
    description:
      'Search for a pattern across files in the repository. Returns matching lines with file paths and line numbers.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'The search pattern (supports basic regex)',
        },
        path: {
          type: 'string',
          description: 'Optional: limit search to a specific directory',
        },
        file_pattern: {
          type: 'string',
          description: 'Optional: filter by file extension (e.g., "*.ts")',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'run_command',
    description:
      'Execute a shell command. Only whitelisted commands are allowed (npm test, npm run lint, etc.).',
    input_schema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The command to execute',
        },
        cwd: {
          type: 'string',
          description: 'Optional: working directory for the command',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'git_status',
    description: 'Get the current git status showing modified, staged, and untracked files.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_pr_diff',
    description: 'Get the diff of all files changed in the current pull request.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_pr_comments',
    description: 'Get all comments on the current pull request.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'add_pr_comment',
    description: 'Post a comment on the current pull request.',
    input_schema: {
      type: 'object',
      properties: {
        body: {
          type: 'string',
          description: 'The comment body (supports markdown)',
        },
      },
      required: ['body'],
    },
  },
  {
    name: 'done',
    description:
      'Signal that all fixes are complete and the remediation is finished. Call this when you have addressed all issues or when you cannot make further progress.',
    input_schema: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'A brief summary of what was fixed',
        },
        issues_fixed: {
          type: 'number',
          description: 'Number of issues that were fixed',
        },
        issues_skipped: {
          type: 'number',
          description: 'Number of issues that could not be fixed',
        },
        reason: {
          type: 'string',
          description: 'If issues were skipped, explain why',
        },
      },
      required: ['summary', 'issues_fixed'],
    },
  },
];

export function getToolDefinitions(): ToolDefinition[] {
  return TOOL_DEFINITIONS;
}
