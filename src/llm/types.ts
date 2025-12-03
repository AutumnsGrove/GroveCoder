/**
 * Common types for LLM providers in GroveCoder
 *
 * This module defines provider-agnostic types that all LLM clients must use.
 * When adding a new provider, map their API responses to these types.
 */

export type MessageRole = 'user' | 'assistant';

/**
 * Tool/function definition schema (OpenAI-compatible format)
 * Both Claude and Kimi K2 use similar schemas for tool definitions.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Tool use request from the model
 */
export interface ToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Tool result to send back to the model
 */
export interface ToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

/**
 * Text content block
 */
export interface TextContent {
  type: 'text';
  text: string;
}

export type ContentBlock = TextContent | ToolUse;
export type MessageContent = TextContent | ToolResult;
export type AssistantContent = ContentBlock[];
export type UserContent = (TextContent | ToolResult)[] | string;

/**
 * A message in the conversation
 */
export interface Message {
  role: MessageRole;
  content: AssistantContent | UserContent;
}

/**
 * Token usage statistics
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** Claude-specific: tokens used to create cache */
  cacheCreationInputTokens?: number;
  /** Claude-specific: tokens read from cache */
  cacheReadInputTokens?: number;
}

/**
 * Stop reason indicating why the model stopped generating
 */
export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | null;

/**
 * Normalized response from any LLM provider
 */
export interface LLMResponse {
  id: string;
  content: ContentBlock[];
  stopReason: StopReason;
  usage: TokenUsage;
  model: string;
  /** The provider that generated this response */
  provider: LLMProvider;
}

/**
 * Options for sending a message to an LLM
 */
export interface SendMessageOptions {
  systemPrompt?: string;
  tools?: ToolDefinition[];
  /** Provider-specific model override */
  model?: string;
}

/**
 * Supported LLM providers
 */
export type LLMProvider = 'claude' | 'kimi';

/**
 * Configuration for initializing an LLM client
 */
export interface LLMClientConfig {
  apiKey?: string;
  maxTokens?: number;
  defaultModel?: string;
}

/**
 * Cost rates per million tokens for a model
 */
export interface ModelCostRates {
  input: number;
  output: number;
}

/**
 * Model information including ID and cost rates
 */
export interface ModelInfo {
  id: string;
  provider: LLMProvider;
  displayName: string;
  costPerMillion: ModelCostRates;
}
