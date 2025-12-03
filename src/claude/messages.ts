/**
 * Message formatting utilities for Claude API
 */

import type { Message, ToolResult, TextContent, ContentBlock, ToolUse } from './types.js';

export function createUserMessage(content: string): Message {
  return {
    role: 'user',
    content,
  };
}

export function createToolResultMessage(results: ToolResult[]): Message {
  return {
    role: 'user',
    content: results,
  };
}

export function createToolResult(
  toolUseId: string,
  content: string,
  isError = false
): ToolResult {
  return {
    type: 'tool_result',
    tool_use_id: toolUseId,
    content,
    is_error: isError,
  };
}

export function extractTextContent(content: ContentBlock[]): string {
  return content
    .filter((block): block is TextContent => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

export function extractToolUses(content: ContentBlock[]): ToolUse[] {
  return content.filter((block): block is ToolUse => block.type === 'tool_use');
}

export function hasToolUse(content: ContentBlock[]): boolean {
  return content.some((block) => block.type === 'tool_use');
}

export function isDoneResponse(content: ContentBlock[]): boolean {
  const text = extractTextContent(content).toLowerCase();
  return (
    text.includes('all issues have been fixed') ||
    text.includes('fixes complete') ||
    text.includes('remediation complete') ||
    (text.includes('done') && !hasToolUse(content))
  );
}
