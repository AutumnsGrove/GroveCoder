/**
 * LLM Client Factory
 *
 * Creates the appropriate LLM client based on configuration.
 * Handles provider selection and model configuration.
 *
 * ## Usage
 *
 * ```typescript
 * import { createLLMClient } from './llm/factory.js';
 *
 * // Use default provider (Claude)
 * const client = createLLMClient();
 *
 * // Use specific provider from config
 * const client = createLLMClient({ provider: 'kimi' });
 *
 * // Full configuration
 * const client = createLLMClient({
 *   provider: 'claude',
 *   model: 'claude-opus-4-20250514',
 *   maxTokens: 4096,
 * });
 * ```
 *
 * ## Future: Automatic Fallback
 *
 * In a future version, this factory will support automatic fallback:
 * - Start with cheaper provider (Kimi K2)
 * - Escalate to Claude on complex issues or failures
 * - Track performance per issue type for smart routing
 *
 * For now, users select the provider via config.
 */

import { logger, ConfigError } from '../utils/index.js';
import type { LLMClient } from './interface.js';
import type { LLMProvider, LLMClientConfig, ModelInfo } from './types.js';
import { ClaudeClient, CLAUDE_MODELS, DEFAULT_CLAUDE_MODEL } from './claude.js';
import { KimiClient, KIMI_MODELS, DEFAULT_KIMI_MODEL } from './kimi.js';
import type { ConfigModel, LLMProviderType } from '../config/types.js';

/**
 * All available models across providers
 */
export const ALL_MODELS: Record<string, ModelInfo> = {
  ...CLAUDE_MODELS,
  ...KIMI_MODELS,
};

/**
 * Default models per provider
 */
export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  claude: DEFAULT_CLAUDE_MODEL,
  kimi: DEFAULT_KIMI_MODEL,
};

/**
 * Options for creating an LLM client
 */
export interface CreateLLMClientOptions {
  /** Provider to use (default: 'claude') */
  provider?: LLMProviderType;
  /** Specific model ID (default: provider's default) */
  model?: string;
  /** Maximum tokens for responses */
  maxTokens?: number;
  /** API key (defaults to environment variable) */
  apiKey?: string;
}

/**
 * Create an LLM client based on configuration
 *
 * @param options - Configuration options
 * @returns Configured LLM client
 * @throws ConfigError if provider is unknown or API key is missing
 */
export function createLLMClient(options: CreateLLMClientOptions = {}): LLMClient {
  const provider = options.provider ?? 'claude';

  logger.info('Creating LLM client', {
    provider,
    model: options.model ?? 'default',
    maxTokens: options.maxTokens ?? 'default',
  });

  const config: LLMClientConfig = {
    apiKey: options.apiKey,
    maxTokens: options.maxTokens,
    defaultModel: options.model,
  };

  switch (provider) {
    case 'claude':
      return new ClaudeClient(config);

    case 'kimi':
      return new KimiClient(config);

    default:
      throw new ConfigError(`Unknown LLM provider: ${provider}`);
  }
}

/**
 * Create an LLM client from GroveCoder config
 *
 * @param modelConfig - Model configuration from .github/grovecoder.yml
 * @returns Configured LLM client
 */
export function createLLMClientFromConfig(modelConfig?: ConfigModel): LLMClient {
  return createLLMClient({
    provider: modelConfig?.provider,
    model: modelConfig?.model,
    maxTokens: modelConfig?.maxTokens,
  });
}

/**
 * Get information about a model
 *
 * @param modelId - Model ID or provider name
 * @returns Model info or undefined if not found
 */
export function getModelInfo(modelId: string): ModelInfo | undefined {
  // Direct lookup
  if (ALL_MODELS[modelId]) {
    return ALL_MODELS[modelId];
  }

  // Try as provider name (return default model for that provider)
  if (modelId === 'claude') {
    return CLAUDE_MODELS[DEFAULT_CLAUDE_MODEL];
  }
  if (modelId === 'kimi') {
    return KIMI_MODELS[DEFAULT_KIMI_MODEL];
  }

  return undefined;
}

/**
 * List all available models
 *
 * @returns Array of model info objects
 */
export function listAvailableModels(): ModelInfo[] {
  return Object.values(ALL_MODELS);
}

/**
 * List models for a specific provider
 *
 * @param provider - Provider name
 * @returns Array of model info objects
 */
export function listModelsForProvider(provider: LLMProvider): ModelInfo[] {
  switch (provider) {
    case 'claude':
      return Object.values(CLAUDE_MODELS);
    case 'kimi':
      return Object.values(KIMI_MODELS);
    default:
      return [];
  }
}

/**
 * Check if a provider's API key is available
 *
 * @param provider - Provider to check
 * @returns true if the API key environment variable is set
 */
export function isProviderAvailable(provider: LLMProvider): boolean {
  switch (provider) {
    case 'claude':
      return !!process.env['ANTHROPIC_API_KEY'];
    case 'kimi':
      return !!process.env['MOONSHOT_API_KEY'];
    default:
      return false;
  }
}

/**
 * Get the list of available providers (those with API keys set)
 *
 * @returns Array of available provider names
 */
export function getAvailableProviders(): LLMProvider[] {
  const providers: LLMProvider[] = ['claude', 'kimi'];
  return providers.filter(isProviderAvailable);
}
