/**
 * Claude API client wrapper for GroveCoder
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger, withRetry, ApiError, ConfigError } from '../utils/index.js';
import type {
  ClaudeClientOptions,
  ClaudeResponse,
  Message,
  ToolDefinition,
  TokenUsage,
  ModelId,
  ContentBlock,
} from './types.js';
import { MODELS, COST_PER_MILLION_TOKENS } from './types.js';

export class ClaudeClient {
  private client: Anthropic;
  private maxTokens: number;
  private defaultModel: ModelId;
  private totalUsage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  };

  constructor(options: ClaudeClientOptions = {}) {
    const apiKey = options.apiKey ?? process.env['ANTHROPIC_API_KEY'];

    if (!apiKey) {
      throw new ConfigError('ANTHROPIC_API_KEY is required');
    }

    this.client = new Anthropic({ apiKey });
    this.maxTokens = options.maxTokens ?? 8192;
    this.defaultModel = (options.defaultModel as ModelId) ?? MODELS.SONNET;
  }

  async sendMessage(
    messages: Message[],
    options: {
      systemPrompt?: string;
      tools?: ToolDefinition[];
      model?: ModelId;
    } = {}
  ): Promise<ClaudeResponse> {
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
            system: options.systemPrompt
              ? [{ type: 'text', text: options.systemPrompt, cache_control: { type: 'ephemeral' } }]
              : undefined,
            messages: messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
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

    return {
      id: response.id,
      content: response.content as ContentBlock[],
      stopReason: response.stop_reason,
      usage,
      model: response.model,
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

  getTotalUsage(): TokenUsage {
    return { ...this.totalUsage };
  }

  calculateCost(model: ModelId = this.defaultModel): number {
    const rates = COST_PER_MILLION_TOKENS[model];
    const inputCost = (this.totalUsage.inputTokens / 1_000_000) * rates.input;
    const outputCost = (this.totalUsage.outputTokens / 1_000_000) * rates.output;
    return inputCost + outputCost;
  }

  resetUsage(): void {
    this.totalUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    };
  }
}
