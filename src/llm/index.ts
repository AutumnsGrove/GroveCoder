/**
 * LLM module for GroveCoder
 *
 * Provides a unified interface for multiple LLM providers (Claude, Kimi K2).
 *
 * ## Quick Start
 *
 * ```typescript
 * import { createLLMClient } from './llm/index.js';
 *
 * // Create client (defaults to Claude)
 * const client = createLLMClient({ provider: 'claude' });
 *
 * // Send a message
 * const response = await client.sendMessage(
 *   [{ role: 'user', content: 'Hello!' }],
 *   { systemPrompt: 'You are a helpful assistant.' }
 * );
 *
 * // Check usage
 * console.log(client.getTotalUsage());
 * console.log(`Cost: $${client.calculateCost().toFixed(4)}`);
 * ```
 *
 * ## Supported Providers
 *
 * - **Claude** (Anthropic): claude-sonnet-4, claude-opus-4
 * - **Kimi** (Moonshot AI): kimi-k2-0711-preview, moonshot-v1-128k
 */

// Types
export type {
  LLMProvider,
  LLMClientConfig,
  LLMResponse,
  Message,
  MessageRole,
  SendMessageOptions,
  TokenUsage,
  ToolDefinition,
  ToolUse,
  ToolResult,
  TextContent,
  ContentBlock,
  MessageContent,
  AssistantContent,
  UserContent,
  ModelInfo,
  ModelCostRates,
  StopReason,
} from './types.js';

// Interface
export type { LLMClient } from './interface.js';

// Implementations
export { ClaudeClient, CLAUDE_MODELS, DEFAULT_CLAUDE_MODEL } from './claude.js';
export { KimiClient, KIMI_MODELS, DEFAULT_KIMI_MODEL } from './kimi.js';

// Factory
export {
  createLLMClient,
  createLLMClientFromConfig,
  getModelInfo,
  listAvailableModels,
  listModelsForProvider,
  isProviderAvailable,
  getAvailableProviders,
  ALL_MODELS,
  DEFAULT_MODELS,
} from './factory.js';
export type { CreateLLMClientOptions } from './factory.js';
