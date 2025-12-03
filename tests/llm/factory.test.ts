/**
 * Tests for the LLM client factory
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createLLMClient,
  createLLMClientFromConfig,
  getModelInfo,
  listAvailableModels,
  listModelsForProvider,
  isProviderAvailable,
  getAvailableProviders,
  ALL_MODELS,
  DEFAULT_MODELS,
} from '../../src/llm/factory.js';
import { ClaudeClient } from '../../src/llm/claude.js';
import { KimiClient } from '../../src/llm/kimi.js';
import { ConfigError } from '../../src/utils/errors.js';

describe('LLM Factory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('createLLMClient', () => {
    it('should create ClaudeClient by default', () => {
      process.env['ANTHROPIC_API_KEY'] = 'test-key';

      const client = createLLMClient();

      expect(client).toBeInstanceOf(ClaudeClient);
      expect(client.provider).toBe('claude');
    });

    it('should create ClaudeClient when provider is claude', () => {
      process.env['ANTHROPIC_API_KEY'] = 'test-key';

      const client = createLLMClient({ provider: 'claude' });

      expect(client).toBeInstanceOf(ClaudeClient);
      expect(client.provider).toBe('claude');
    });

    it('should create KimiClient when provider is kimi', () => {
      process.env['MOONSHOT_API_KEY'] = 'test-key';

      const client = createLLMClient({ provider: 'kimi' });

      expect(client).toBeInstanceOf(KimiClient);
      expect(client.provider).toBe('kimi');
    });

    it('should throw ConfigError for unknown provider', () => {
      expect(() => {
        createLLMClient({ provider: 'unknown' as 'claude' | 'kimi' });
      }).toThrow(ConfigError);
    });

    it('should throw ConfigError when API key is missing for Claude', () => {
      delete process.env['ANTHROPIC_API_KEY'];

      expect(() => {
        createLLMClient({ provider: 'claude' });
      }).toThrow(ConfigError);
    });

    it('should throw ConfigError when API key is missing for Kimi', () => {
      delete process.env['MOONSHOT_API_KEY'];

      expect(() => {
        createLLMClient({ provider: 'kimi' });
      }).toThrow(ConfigError);
    });

    it('should pass custom model to client', () => {
      process.env['ANTHROPIC_API_KEY'] = 'test-key';

      const client = createLLMClient({
        provider: 'claude',
        model: 'claude-opus-4-20250514',
      });

      expect(client).toBeInstanceOf(ClaudeClient);
    });
  });

  describe('createLLMClientFromConfig', () => {
    it('should create ClaudeClient when config is undefined', () => {
      process.env['ANTHROPIC_API_KEY'] = 'test-key';

      const client = createLLMClientFromConfig(undefined);

      expect(client).toBeInstanceOf(ClaudeClient);
    });

    it('should create client based on config provider', () => {
      process.env['MOONSHOT_API_KEY'] = 'test-key';

      const client = createLLMClientFromConfig({ provider: 'kimi' });

      expect(client).toBeInstanceOf(KimiClient);
    });

    it('should pass model and maxTokens from config', () => {
      process.env['ANTHROPIC_API_KEY'] = 'test-key';

      const client = createLLMClientFromConfig({
        provider: 'claude',
        model: 'claude-opus-4-20250514',
        maxTokens: 4096,
      });

      expect(client).toBeInstanceOf(ClaudeClient);
    });
  });

  describe('getModelInfo', () => {
    it('should return model info for valid Claude model', () => {
      const info = getModelInfo('claude-sonnet-4-20250514');

      expect(info).toBeDefined();
      expect(info?.provider).toBe('claude');
      expect(info?.displayName).toBe('Claude Sonnet 4');
    });

    it('should return model info for valid Kimi model', () => {
      const info = getModelInfo('kimi-k2-0711-preview');

      expect(info).toBeDefined();
      expect(info?.provider).toBe('kimi');
      expect(info?.displayName).toBe('Kimi K2 Preview');
    });

    it('should return default model info when provider name is passed', () => {
      const claudeInfo = getModelInfo('claude');
      const kimiInfo = getModelInfo('kimi');

      expect(claudeInfo).toBeDefined();
      expect(claudeInfo?.provider).toBe('claude');
      expect(kimiInfo).toBeDefined();
      expect(kimiInfo?.provider).toBe('kimi');
    });

    it('should return undefined for unknown model', () => {
      const info = getModelInfo('unknown-model');

      expect(info).toBeUndefined();
    });
  });

  describe('listAvailableModels', () => {
    it('should return all available models', () => {
      const models = listAvailableModels();

      expect(models.length).toBeGreaterThan(0);
      expect(models.some((m) => m.provider === 'claude')).toBe(true);
      expect(models.some((m) => m.provider === 'kimi')).toBe(true);
    });
  });

  describe('listModelsForProvider', () => {
    it('should return Claude models', () => {
      const models = listModelsForProvider('claude');

      expect(models.length).toBeGreaterThan(0);
      expect(models.every((m) => m.provider === 'claude')).toBe(true);
    });

    it('should return Kimi models', () => {
      const models = listModelsForProvider('kimi');

      expect(models.length).toBeGreaterThan(0);
      expect(models.every((m) => m.provider === 'kimi')).toBe(true);
    });

    it('should return empty array for unknown provider', () => {
      const models = listModelsForProvider('unknown' as 'claude' | 'kimi');

      expect(models).toEqual([]);
    });
  });

  describe('isProviderAvailable', () => {
    it('should return true when Claude API key is set', () => {
      process.env['ANTHROPIC_API_KEY'] = 'test-key';

      expect(isProviderAvailable('claude')).toBe(true);
    });

    it('should return false when Claude API key is not set', () => {
      delete process.env['ANTHROPIC_API_KEY'];

      expect(isProviderAvailable('claude')).toBe(false);
    });

    it('should return true when Kimi API key is set', () => {
      process.env['MOONSHOT_API_KEY'] = 'test-key';

      expect(isProviderAvailable('kimi')).toBe(true);
    });

    it('should return false when Kimi API key is not set', () => {
      delete process.env['MOONSHOT_API_KEY'];

      expect(isProviderAvailable('kimi')).toBe(false);
    });
  });

  describe('getAvailableProviders', () => {
    it('should return providers with API keys set', () => {
      process.env['ANTHROPIC_API_KEY'] = 'test-key';
      process.env['MOONSHOT_API_KEY'] = 'test-key';

      const providers = getAvailableProviders();

      expect(providers).toContain('claude');
      expect(providers).toContain('kimi');
    });

    it('should return empty array when no API keys are set', () => {
      delete process.env['ANTHROPIC_API_KEY'];
      delete process.env['MOONSHOT_API_KEY'];

      const providers = getAvailableProviders();

      expect(providers).toEqual([]);
    });
  });

  describe('DEFAULT_MODELS', () => {
    it('should have default models for all providers', () => {
      expect(DEFAULT_MODELS.claude).toBeDefined();
      expect(DEFAULT_MODELS.kimi).toBeDefined();
    });
  });

  describe('ALL_MODELS', () => {
    it('should contain both Claude and Kimi models', () => {
      const modelIds = Object.keys(ALL_MODELS);

      expect(modelIds.some((id) => id.includes('claude'))).toBe(true);
      expect(modelIds.some((id) => id.includes('kimi') || id.includes('moonshot'))).toBe(true);
    });
  });
});
