/**
 * Claude API types for GroveCoder
 */

import type Anthropic from '@anthropic-ai/sdk';

export type MessageRole = 'user' | 'assistant';

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface TextContent {
  type: 'text';
  text: string;
}

export type ContentBlock = TextContent | ToolUse;
export type MessageContent = TextContent | ToolResult;
export type AssistantContent = ContentBlock[];
export type UserContent = (TextContent | ToolResult)[] | string;

export interface Message {
  role: MessageRole;
  content: AssistantContent | UserContent;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

export interface ClaudeResponse {
  id: string;
  content: ContentBlock[];
  stopReason: Anthropic.Message['stop_reason'];
  usage: TokenUsage;
  model: string;
}

export interface ClaudeClientOptions {
  apiKey?: string;
  maxTokens?: number;
  defaultModel?: string;
}

export const MODELS = {
  SONNET: 'claude-sonnet-4-20250514',
  OPUS: 'claude-opus-4-20250514',
} as const;

export type ModelId = (typeof MODELS)[keyof typeof MODELS];

export const COST_PER_MILLION_TOKENS: Record<ModelId, { input: number; output: number }> = {
  [MODELS.SONNET]: { input: 3, output: 15 },
  [MODELS.OPUS]: { input: 15, output: 75 },
};
