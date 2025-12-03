/**
 * Claude LLM client implementation
 *
 * Wraps the Anthropic SDK and implements the LLMClient interface.
 * Supports prompt caching for cost optimization.
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger, withRetry, ApiError, ConfigError } from '../utils/index.js';
import type { LLMClient } from './interface.js';
import type {
  Message,
  LLMResponse,
  SendMessageOptions,
  TokenUsage,
  LLMClientConfig,
  ContentBlock,
  ModelInfo,
} from './types.js';

/**
 * Claude model definitions with costs
 * Costs are per million tokens as of late 2024
 */
export const CLAUDE_MODELS: Record<string, ModelInfo> = {
  'claude-sonnet-4-20250514': {
    id: 'claude-sonnet-4-20250514',
    provider: 'claude',
    displayName: 'Claude Sonnet 4',
    costPerMillion: { input: 3, output: 15 },
  },
  'claude-opus-4-20250514': {
    id: 'claude-opus-4-20250514',
    provider: 'claude',
    displayName: 'Claude Opus 4',
    costPerMillion: { input: 15, output: 75 },
  },
} as const;

export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-20250514';

/**
 * Claude API client implementing LLMClient interface
 */
export class ClaudeClient implements LLMClient {
  readonly provider = 'claude' as const;

  private client: Anthropic;
  private maxTokens: number;
  private defaultModel: string;
  private totalUsage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  };

  constructor(config: LLMClientConfig = {}) {
    const apiKey = config.apiKey ?? process.env['ANTHROPIC_API_KEY'];

    if (!apiKey) {
      throw new ConfigError('ANTHROPIC_API_KEY is required for Claude provider');
    }

    this.client = new Anthropic({ apiKey });
    this.maxTokens = config.maxTokens ?? 8192;
    this.defaultModel = config.defaultModel ?? DEFAULT_CLAUDE_MODEL;
  }

  async sendMessage(messages: Message[], options: SendMessageOptions = {}): Promise<LLMResponse> {
    const model = options.model ?? this.defaultModel;

    logger.debug('Sending message to Claude', {
      model,
      messageCount: messages.length,
      hasTools: !!options.tools?.length,
    });

    const response = await withRetry(
      async () => {
        try {
          return await this.client.messages.create({
            model,
            max_tokens: this.maxTokens,
            // Use prompt caching for system prompt (saves ~25% on repeated calls)
            system: options.systemPrompt
              ? [{ type: 'text', text: options.systemPrompt, cache_control: { type: 'ephemeral' } }]
              : undefined,
            messages: messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            // Cache tool definitions as well
            tools: options.tools?.map((t) => ({
              ...t,
              cache_control: { type: 'ephemeral' } as const,
            })),
          });
        } catch (error) {
          if (error instanceof Anthropic.APIError) {
            throw new ApiError(error.message, error.status, 'claude');
          }
          throw error;
        }
      },
      {
        maxAttempts: 3,
        shouldRetry: (error) => {
          if (error instanceof ApiError) {
            return error.recoverable;
          }
          return false;
        },
      }
    );

    // Extract token usage including cache stats
    const usage: TokenUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheCreationInputTokens:
        'cache_creation_input_tokens' in response.usage
          ? (response.usage.cache_creation_input_tokens as number)
          : 0,
      cacheReadInputTokens:
        'cache_read_input_tokens' in response.usage
          ? (response.usage.cache_read_input_tokens as number)
          : 0,
    };

    this.updateUsage(usage);

    logger.debug('Received response from Claude', {
      stopReason: response.stop_reason,
      contentBlocks: response.content.length,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });

    // Map Claude's stop reason to normalized format
    const stopReason = this.mapStopReason(response.stop_reason);

    return {
      id: response.id,
      content: response.content as ContentBlock[],
      stopReason,
      usage,
      model: response.model,
      provider: 'claude',
    };
  }

  getTotalUsage(): TokenUsage {
    return { ...this.totalUsage };
  }

  calculateCost(model?: string): number {
    const modelId = model ?? this.defaultModel;
    const modelInfo = CLAUDE_MODELS[modelId];

    if (!modelInfo) {
      logger.warn('Unknown Claude model for cost calculation', { model: modelId });
      // Fall back to Sonnet pricing
      const fallback = CLAUDE_MODELS[DEFAULT_CLAUDE_MODEL]!;
      return this.computeCost(fallback.costPerMillion);
    }

    return this.computeCost(modelInfo.costPerMillion);
  }

  resetUsage(): void {
    this.totalUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    };
  }

  private updateUsage(usage: TokenUsage): void {
    this.totalUsage.inputTokens += usage.inputTokens;
    this.totalUsage.outputTokens += usage.outputTokens;
    this.totalUsage.cacheCreationInputTokens =
      (this.totalUsage.cacheCreationInputTokens ?? 0) + (usage.cacheCreationInputTokens ?? 0);
    this.totalUsage.cacheReadInputTokens =
      (this.totalUsage.cacheReadInputTokens ?? 0) + (usage.cacheReadInputTokens ?? 0);
  }

  private computeCost(rates: { input: number; output: number }): number {
    const inputCost = (this.totalUsage.inputTokens / 1_000_000) * rates.input;
    const outputCost = (this.totalUsage.outputTokens / 1_000_000) * rates.output;
    return inputCost + outputCost;
  }

  private mapStopReason(
    reason: Anthropic.Message['stop_reason']
  ): LLMResponse['stopReason'] {
    switch (reason) {
      case 'end_turn':
        return 'end_turn';
      case 'tool_use':
        return 'tool_use';
      case 'max_tokens':
        return 'max_tokens';
      case 'stop_sequence':
        return 'stop_sequence';
      default:
        return null;
    }
  }
}
