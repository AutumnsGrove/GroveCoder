/**
 * Tool registry and dispatcher for GroveCoder
 */

import { logger, ToolExecutionError } from '../utils/index.js';
import { GitHubClient } from '../github/client.js';
import type { RepoContext } from '../github/types.js';
import type { ToolUse } from '../claude/types.js';

import { readFile, writeFile, editFile, listDirectory, type FileOpsContext } from './file-ops.js';
import { runCommand, gitStatus } from './shell.js';
import { getPrDiff, getPrComments, addPrComment, type GitHubToolsContext } from './github-api.js';
import { searchFiles } from './search.js';
import { webFetch } from './web-fetch.js';
import { requestHumanHelp, type HumanHelpRequest } from './human-help.js';

export { getToolDefinitions, TOOL_DEFINITIONS } from './definitions.js';

export interface ToolContext {
  github: GitHubClient;
  repo: RepoContext;
  branch: string;
  prNumber: number;
  fileCache: Map<string, { content: string; sha: string }>;
}

export interface ToolExecutionResult {
  success: boolean;
  output: string;
  isDone?: boolean;
  summary?: {
    issuesFixed: number;
    issuesSkipped: number;
    reason?: string;
  };
}

export async function executeTool(
  toolUse: ToolUse,
  ctx: ToolContext
): Promise<ToolExecutionResult> {
  const { name, input } = toolUse;

  logger.debug('Executing tool', { name, inputKeys: Object.keys(input) });

  try {
    const fileCtx: FileOpsContext = {
      github: ctx.github,
      repo: ctx.repo,
      branch: ctx.branch,
      fileCache: ctx.fileCache,
    };

    const ghCtx: GitHubToolsContext = {
      github: ctx.github,
      repo: ctx.repo,
      prNumber: ctx.prNumber,
    };

    let output: string;

    switch (name) {
      case 'read_file':
        output = await readFile(fileCtx, input['path'] as string);
        break;

      case 'write_file':
        output = await writeFile(fileCtx, input['path'] as string, input['content'] as string);
        break;

      case 'edit_file':
        output = await editFile(
          fileCtx,
          input['path'] as string,
          input['old_string'] as string,
          input['new_string'] as string
        );
        break;

      case 'list_directory':
        output = await listDirectory(fileCtx, input['path'] as string);
        break;

      case 'search_files':
        output = await searchFiles(
          input['pattern'] as string,
          input['path'] as string | undefined,
          input['file_pattern'] as string | undefined
        );
        break;

      case 'run_command':
        output = await runCommand(input['command'] as string, input['cwd'] as string | undefined);
        break;

      case 'git_status':
        output = await gitStatus();
        break;

      case 'get_pr_diff':
        output = await getPrDiff(ghCtx);
        break;

      case 'get_pr_comments':
        output = await getPrComments(ghCtx);
        break;

      case 'add_pr_comment':
        output = await addPrComment(ghCtx, input['body'] as string);
        break;

      case 'web_fetch':
        output = await webFetch(input['url'] as string);
        break;

      case 'request_human_help': {
        const helpRequest: HumanHelpRequest = {
          summary: input['summary'] as string,
          blockers: input['blockers'] as string[],
          suggestions: input['suggestions'] as string[] | undefined,
          issuesFixed: input['issues_fixed'] as number | undefined,
          issuesRemaining: input['issues_remaining'] as number | undefined,
        };
        output = await requestHumanHelp(
          { github: ctx.github, repo: ctx.repo, prNumber: ctx.prNumber },
          helpRequest
        );
        // request_human_help is effectively a done signal
        return {
          success: true,
          output,
          isDone: true,
          summary: {
            issuesFixed: helpRequest.issuesFixed ?? 0,
            issuesSkipped: helpRequest.issuesRemaining ?? 0,
            reason: 'Requested human help',
          },
        };
      }

      case 'done':
        return {
          success: true,
          output: input['summary'] as string,
          isDone: true,
          summary: {
            issuesFixed: (input['issues_fixed'] as number) ?? 0,
            issuesSkipped: (input['issues_skipped'] as number) ?? 0,
            reason: input['reason'] as string | undefined,
          },
        };

      default:
        throw new ToolExecutionError(`Unknown tool: ${name}`, name, false);
    }

    logger.debug('Tool executed successfully', { name, outputLength: output.length });

    return { success: true, output };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isRecoverable = error instanceof ToolExecutionError ? error.recoverable : true;

    logger.warn('Tool execution failed', { name, error: message, recoverable: isRecoverable });

    return {
      success: false,
      output: `Error: ${message}`,
    };
  }
}

export async function executeTools(
  toolUses: ToolUse[],
  ctx: ToolContext
): Promise<Map<string, ToolExecutionResult>> {
  const results = new Map<string, ToolExecutionResult>();

  // Execute tools sequentially to avoid race conditions on file operations
  for (const toolUse of toolUses) {
    const result = await executeTool(toolUse, ctx);
    results.set(toolUse.id, result);

    // If we hit a 'done' tool, stop processing
    if (result.isDone) {
      break;
    }
  }

  return results;
}
