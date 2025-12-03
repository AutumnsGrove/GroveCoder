/**
 * Abstract LLM client interface for GroveCoder
 *
 * All LLM providers must implement this interface to be usable with the agent loop.
 * This abstraction allows swapping between providers (Claude, Kimi K2, etc.) without
 * changing the core agent logic.
 *
 * ## Adding a New Provider
 *
 * 1. Create a new file (e.g., `src/llm/newprovider.ts`)
 * 2. Implement the `LLMClient` interface
 * 3. Map the provider's API response format to `LLMResponse`
 * 4. Add the provider to `LLMProvider` type in `types.ts`
 * 5. Register in the factory (`factory.ts`)
 * 6. Add cost rates to `PROVIDER_MODELS`
 */

import type {
  Message,
  LLMResponse,
  SendMessageOptions,
  TokenUsage,
  LLMProvider,
} from './types.js';

/**
 * Abstract interface for LLM clients
 *
 * Implementations handle:
 * - API authentication and communication
 * - Message format conversion (to/from provider format)
 * - Tool calling format conversion
 * - Token usage tracking
 * - Cost calculation
 * - Retry logic with backoff
 */
export interface LLMClient {
  /**
   * The provider this client connects to
   */
  readonly provider: LLMProvider;

  /**
   * Send a message to the LLM and get a response
   *
   * @param messages - Conversation history in normalized format
   * @param options - Optional system prompt, tools, and model override
   * @returns Normalized response with content, usage, and metadata
   * @throws ApiError on API failures (after retries exhausted)
   * @throws ConfigError on configuration issues
   */
  sendMessage(messages: Message[], options?: SendMessageOptions): Promise<LLMResponse>;

  /**
   * Get cumulative token usage across all requests
   */
  getTotalUsage(): TokenUsage;

  /**
   * Calculate estimated cost in USD based on token usage
   *
   * @param model - Optional model override (uses default if not specified)
   * @returns Cost in USD
   */
  calculateCost(model?: string): number;

  /**
   * Reset token usage counters (e.g., between sessions)
   */
  resetUsage(): void;
}
