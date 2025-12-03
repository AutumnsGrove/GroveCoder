/**
 * Kimi K2 LLM client implementation (Moonshot AI)
 *
 * Kimi K2 uses an OpenAI-compatible API at api.moonshot.cn/v1.
 * This implementation uses native fetch (Node 18+) to avoid extra dependencies.
 *
 * ## API Documentation
 * - Base URL: https://api.moonshot.cn/v1
 * - Endpoint: /chat/completions (OpenAI-compatible)
 * - Auth: Bearer token via MOONSHOT_API_KEY
 *
 * ## Function Calling Format
 * Kimi K2 uses OpenAI-style function calling:
 * - Request: `tools` array with `type: "function"` and `function: { name, description, parameters }`
 * - Response: `tool_calls` array in the assistant message
 *
 * ## Troubleshooting
 * If tool calling doesn't work as expected:
 * 1. Check the `convertToolDefinitions()` method - may need schema adjustments
 * 2. Check `parseToolCalls()` - response format may differ
 * 3. Verify the model supports function calling (kimi-k2-0711-preview does)
 * 4. Check Moonshot API docs for any format changes
 *
 * ## Known Differences from Claude
 * - No prompt caching (costs may be higher for repeated system prompts)
 * - Tool calls returned in message.tool_calls, not as content blocks
 * - Stop reason format: 'stop', 'tool_calls', 'length' (vs Claude's 'end_turn', 'tool_use', 'max_tokens')
 */

import { logger, withRetry, ApiError, ConfigError } from '../utils/index.js';
import type { LLMClient } from './interface.js';
import type {
  Message,
  LLMResponse,
  SendMessageOptions,
  TokenUsage,
  LLMClientConfig,
  ContentBlock,
  ToolDefinition,
  ToolUse,
  TextContent,
  ModelInfo,
  StopReason,
} from './types.js';

/** Moonshot API base URL */
const MOONSHOT_API_BASE = 'https://api.moonshot.cn/v1';

/**
 * Kimi model definitions with costs
 * Costs are estimates - verify with Moonshot's current pricing
 *
 * Note: Kimi K2 is significantly cheaper than Claude, making it
 * ideal for simpler fixes before escalating to Claude.
 */
export const KIMI_MODELS: Record<string, ModelInfo> = {
  'kimi-k2-0711-preview': {
    id: 'kimi-k2-0711-preview',
    provider: 'kimi',
    displayName: 'Kimi K2 Preview',
    // Pricing: roughly $0.5/M input, $1.5/M output (verify with Moonshot)
    costPerMillion: { input: 0.5, output: 1.5 },
  },
  'moonshot-v1-128k': {
    id: 'moonshot-v1-128k',
    provider: 'kimi',
    displayName: 'Moonshot v1 128K',
    costPerMillion: { input: 0.8, output: 2.0 },
  },
} as const;

export const DEFAULT_KIMI_MODEL = 'kimi-k2-0711-preview';

/**
 * OpenAI-compatible message format for Moonshot API
 */
interface MoonshotMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: MoonshotToolCall[];
  tool_call_id?: string;
}

/**
 * OpenAI-compatible tool call format
 */
interface MoonshotToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

/**
 * OpenAI-compatible tool definition format
 */
interface MoonshotTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

/**
 * Moonshot API response format
 */
interface MoonshotResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: MoonshotMessage;
    finish_reason: 'stop' | 'tool_calls' | 'length' | null;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Kimi K2 API client implementing LLMClient interface
 */
export class KimiClient implements LLMClient {
  readonly provider = 'kimi' as const;

  private apiKey: string;
  private maxTokens: number;
  private defaultModel: string;
  private totalUsage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
  };

  constructor(config: LLMClientConfig = {}) {
    const apiKey = config.apiKey ?? process.env['MOONSHOT_API_KEY'];

    if (!apiKey) {
      throw new ConfigError('MOONSHOT_API_KEY is required for Kimi provider');
    }

    this.apiKey = apiKey;
    this.maxTokens = config.maxTokens ?? 8192;
    this.defaultModel = config.defaultModel ?? DEFAULT_KIMI_MODEL;
  }

  async sendMessage(messages: Message[], options: SendMessageOptions = {}): Promise<LLMResponse> {
    const model = options.model ?? this.defaultModel;

    logger.debug('Sending message to Kimi', {
      model,
      messageCount: messages.length,
      hasTools: !!options.tools?.length,
    });

    // Convert messages to Moonshot format
    const moonshotMessages = this.convertMessages(messages, options.systemPrompt);

    // Convert tools to OpenAI format
    const moonshotTools = options.tools ? this.convertToolDefinitions(options.tools) : undefined;

    const response = await withRetry(
      async () => {
        const res = await fetch(`${MOONSHOT_API_BASE}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: moonshotMessages,
            max_tokens: this.maxTokens,
            tools: moonshotTools,
            // Only include tool_choice if tools are provided
            ...(moonshotTools && { tool_choice: 'auto' }),
          }),
        });

        if (!res.ok) {
          const errorBody = await res.text();
          logger.error('Kimi API error', { status: res.status, body: errorBody });
          throw new ApiError(
            `Kimi API error: ${res.status} ${errorBody}`,
            res.status,
            'kimi'
          );
        }

        return (await res.json()) as MoonshotResponse;
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

    // Extract usage
    const usage: TokenUsage = {
      inputTokens: response.usage.prompt_tokens,
      outputTokens: response.usage.completion_tokens,
    };

    this.updateUsage(usage);

    // Parse response content
    const choice = response.choices[0];
    if (!choice) {
      throw new ApiError('No response from Kimi API', 500, 'kimi');
    }

    const content = this.parseResponseContent(choice.message);
    const stopReason = this.mapStopReason(choice.finish_reason);

    logger.debug('Received response from Kimi', {
      stopReason,
      contentBlocks: content.length,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      hasToolCalls: choice.message.tool_calls?.length ?? 0,
    });

    return {
      id: response.id,
      content,
      stopReason,
      usage,
      model: response.model,
      provider: 'kimi',
    };
  }

  getTotalUsage(): TokenUsage {
    return { ...this.totalUsage };
  }

  calculateCost(model?: string): number {
    const modelId = model ?? this.defaultModel;
    const modelInfo = KIMI_MODELS[modelId];

    if (!modelInfo) {
      logger.warn('Unknown Kimi model for cost calculation', { model: modelId });
      // Fall back to K2 pricing
      const fallback = KIMI_MODELS[DEFAULT_KIMI_MODEL]!;
      return this.computeCost(fallback.costPerMillion);
    }

    return this.computeCost(modelInfo.costPerMillion);
  }

  resetUsage(): void {
    this.totalUsage = {
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  /**
   * Convert our normalized messages to Moonshot format
   *
   * Key differences:
   * - System prompt is a separate message with role: 'system'
   * - Tool results use role: 'tool' with tool_call_id
   * - Assistant tool calls are in message.tool_calls, not content
   */
  private convertMessages(messages: Message[], systemPrompt?: string): MoonshotMessage[] {
    const result: MoonshotMessage[] = [];

    // Add system prompt if provided
    if (systemPrompt) {
      result.push({ role: 'system', content: systemPrompt });
    }

    for (const msg of messages) {
      if (msg.role === 'user') {
        // User messages can be string or array
        if (typeof msg.content === 'string') {
          result.push({ role: 'user', content: msg.content });
        } else if (Array.isArray(msg.content)) {
          // Check if it contains tool results
          const toolResults = msg.content.filter(
            (c): c is { type: 'tool_result'; tool_use_id: string; content: string } =>
              c.type === 'tool_result'
          );

          if (toolResults.length > 0) {
            // Convert tool results to separate tool messages
            for (const toolResult of toolResults) {
              result.push({
                role: 'tool',
                content: toolResult.content,
                tool_call_id: toolResult.tool_use_id,
              } as MoonshotMessage);
            }
          } else {
            // Regular text content
            const textParts = msg.content
              .filter((c): c is TextContent => c.type === 'text')
              .map((c) => c.text)
              .join('\n');
            result.push({ role: 'user', content: textParts });
          }
        }
      } else if (msg.role === 'assistant') {
        // Assistant messages may contain tool uses
        const content = msg.content as ContentBlock[];
        const textParts: string[] = [];
        const toolCalls: MoonshotToolCall[] = [];

        for (const block of content) {
          if (block.type === 'text') {
            textParts.push(block.text);
          } else if (block.type === 'tool_use') {
            toolCalls.push({
              id: block.id,
              type: 'function',
              function: {
                name: block.name,
                arguments: JSON.stringify(block.input),
              },
            });
          }
        }

        const assistantMsg: MoonshotMessage = {
          role: 'assistant',
          content: textParts.length > 0 ? textParts.join('\n') : null,
        };

        if (toolCalls.length > 0) {
          assistantMsg.tool_calls = toolCalls;
        }

        result.push(assistantMsg);
      }
    }

    return result;
  }

  /**
   * Convert our tool definitions to OpenAI format
   *
   * Our format uses `input_schema`, OpenAI uses `parameters`
   */
  private convertToolDefinitions(tools: ToolDefinition[]): MoonshotTool[] {
    return tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: tool.input_schema.properties,
          required: tool.input_schema.required,
        },
      },
    }));
  }

  /**
   * Parse Moonshot response into our ContentBlock format
   *
   * Moonshot puts tool calls in message.tool_calls (OpenAI style)
   * while Claude puts them as content blocks. We normalize to content blocks.
   */
  private parseResponseContent(message: MoonshotMessage): ContentBlock[] {
    const content: ContentBlock[] = [];

    // Add text content if present
    if (message.content) {
      content.push({ type: 'text', text: message.content });
    }

    // Convert tool calls to our ToolUse format
    if (message.tool_calls) {
      for (const toolCall of message.tool_calls) {
        try {
          const input = JSON.parse(toolCall.function.arguments);
          content.push({
            type: 'tool_use',
            id: toolCall.id,
            name: toolCall.function.name,
            input,
          } as ToolUse);
        } catch (error) {
          logger.error('Failed to parse Kimi tool call arguments', {
            toolCall,
            error: String(error),
          });
          // Still add it with empty input so we can report the error
          content.push({
            type: 'tool_use',
            id: toolCall.id,
            name: toolCall.function.name,
            input: {},
          } as ToolUse);
        }
      }
    }

    return content;
  }

  /**
   * Map Moonshot stop reasons to our normalized format
   */
  private mapStopReason(reason: string | null): StopReason {
    switch (reason) {
      case 'stop':
        return 'end_turn';
      case 'tool_calls':
        return 'tool_use';
      case 'length':
        return 'max_tokens';
      default:
        return null;
    }
  }

  private updateUsage(usage: TokenUsage): void {
    this.totalUsage.inputTokens += usage.inputTokens;
    this.totalUsage.outputTokens += usage.outputTokens;
  }

  private computeCost(rates: { input: number; output: number }): number {
    const inputCost = (this.totalUsage.inputTokens / 1_000_000) * rates.input;
    const outputCost = (this.totalUsage.outputTokens / 1_000_000) * rates.output;
    return inputCost + outputCost;
  }
}
