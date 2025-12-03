/**
 * Tests for config loader
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  validateConfig,
  mergeWithSafetyDefaults,
  getMergedAllowedCommands,
  getMergedProtectedPatterns,
  ConfigValidationError,
} from '../../src/config/loader.js';
import {
  DEFAULT_CONFIG,
  DEFAULT_ALLOWED_COMMANDS,
  DEFAULT_PROTECTED_PATTERNS,
  DEFAULT_PROTECTED_BRANCHES,
  HARD_LIMITS,
} from '../../src/config/types.js';

describe('validateConfig', () => {
  describe('version validation', () => {
    it('should accept version 1', () => {
      const config = validateConfig({ version: '1' });
      expect(config.version).toBe('1');
    });

    it('should default to version 1 when not specified', () => {
      const config = validateConfig({});
      expect(config.version).toBe('1');
    });

    it('should reject unsupported versions', () => {
      expect(() => validateConfig({ version: '2' })).toThrow(ConfigValidationError);
    });
  });

  describe('safety limits validation', () => {
    it('should accept valid safety limits', () => {
      const config = validateConfig({
        safety: {
          maxIterations: 10,
          maxCostUsd: 1.0,
          maxExecutionTimeSeconds: 300,
          progressUpdateInterval: 3,
        },
      });

      expect(config.safety?.maxIterations).toBe(10);
      expect(config.safety?.maxCostUsd).toBe(1.0);
      expect(config.safety?.maxExecutionTimeSeconds).toBe(300);
      expect(config.safety?.progressUpdateInterval).toBe(3);
    });

    it('should reject maxIterations below minimum', () => {
      expect(() =>
        validateConfig({
          safety: { maxIterations: 0 },
        })
      ).toThrow(ConfigValidationError);
    });

    it('should reject maxIterations above maximum', () => {
      expect(() =>
        validateConfig({
          safety: { maxIterations: 100 },
        })
      ).toThrow(ConfigValidationError);
    });

    it('should reject maxCostUsd below minimum', () => {
      expect(() =>
        validateConfig({
          safety: { maxCostUsd: 0.01 },
        })
      ).toThrow(ConfigValidationError);
    });

    it('should reject maxCostUsd above maximum', () => {
      expect(() =>
        validateConfig({
          safety: { maxCostUsd: 10.0 },
        })
      ).toThrow(ConfigValidationError);
    });

    it('should reject non-integer maxIterations', () => {
      expect(() =>
        validateConfig({
          safety: { maxIterations: 10.5 },
        })
      ).toThrow(ConfigValidationError);
    });
  });

  describe('commands validation', () => {
    it('should accept valid allowed commands', () => {
      const config = validateConfig({
        commands: {
          allowed: ['make test', 'cargo build'],
        },
      });

      expect(config.commands?.allowed).toEqual(['make test', 'cargo build']);
    });

    it('should accept valid blocked commands', () => {
      const config = validateConfig({
        commands: {
          blocked: ['npm audit'],
        },
      });

      expect(config.commands?.blocked).toEqual(['npm audit']);
    });

    it('should reject non-array allowed commands', () => {
      expect(() =>
        validateConfig({
          commands: { allowed: 'npm test' },
        })
      ).toThrow(ConfigValidationError);
    });

    it('should reject non-string array items', () => {
      expect(() =>
        validateConfig({
          commands: { allowed: [123] },
        })
      ).toThrow(ConfigValidationError);
    });
  });

  describe('protectedPaths validation', () => {
    it('should accept valid patterns', () => {
      const config = validateConfig({
        protectedPaths: {
          patterns: ['config/**', 'secrets/**'],
          branches: ['staging'],
        },
      });

      expect(config.protectedPaths?.patterns).toEqual(['config/**', 'secrets/**']);
      expect(config.protectedPaths?.branches).toEqual(['staging']);
    });
  });

  describe('behavior validation', () => {
    it('should accept valid behavior settings', () => {
      const config = validateConfig({
        behavior: {
          autoApprove: true,
          requestReReview: false,
          minSeverity: 'major',
          ignorePatterns: ['TODO:*'],
        },
      });

      expect(config.behavior?.autoApprove).toBe(true);
      expect(config.behavior?.requestReReview).toBe(false);
      expect(config.behavior?.minSeverity).toBe('major');
      expect(config.behavior?.ignorePatterns).toEqual(['TODO:*']);
    });

    it('should reject invalid minSeverity', () => {
      expect(() =>
        validateConfig({
          behavior: { minSeverity: 'invalid' },
        })
      ).toThrow(ConfigValidationError);
    });

    it('should reject non-boolean autoApprove', () => {
      expect(() =>
        validateConfig({
          behavior: { autoApprove: 'yes' },
        })
      ).toThrow(ConfigValidationError);
    });
  });

  describe('unknown fields', () => {
    it('should ignore unknown fields (with warning logged)', () => {
      // Should not throw
      const config = validateConfig({
        version: '1',
        unknownField: 'value',
      });

      expect(config.version).toBe('1');
    });
  });
});

describe('mergeWithSafetyDefaults', () => {
  it('should use defaults when no config provided', () => {
    const limits = mergeWithSafetyDefaults(DEFAULT_CONFIG);

    expect(limits.maxLoopIterations).toBe(25);
    expect(limits.maxCostUsd).toBe(2.0);
    expect(limits.maxExecutionTimeMs).toBe(900 * 1000);
  });

  it('should override defaults with user config', () => {
    const config = validateConfig({
      safety: {
        maxIterations: 10,
        maxCostUsd: 0.5,
      },
    });

    const limits = mergeWithSafetyDefaults(config);

    expect(limits.maxLoopIterations).toBe(10);
    expect(limits.maxCostUsd).toBe(0.5);
  });

  it('should merge protected branches', () => {
    const config = validateConfig({
      protectedPaths: {
        branches: ['staging', 'develop'],
      },
    });

    const limits = mergeWithSafetyDefaults(config);

    expect(limits.protectedBranches).toContain('main');
    expect(limits.protectedBranches).toContain('master');
    expect(limits.protectedBranches).toContain('staging');
    expect(limits.protectedBranches).toContain('develop');
  });

  it('should deduplicate protected branches', () => {
    const config = validateConfig({
      protectedPaths: {
        branches: ['main', 'main'], // Duplicates
      },
    });

    const limits = mergeWithSafetyDefaults(config);

    const mainCount = limits.protectedBranches.filter((b) => b === 'main').length;
    expect(mainCount).toBe(1);
  });
});

describe('getMergedAllowedCommands', () => {
  it('should return defaults when no config', () => {
    const commands = getMergedAllowedCommands(DEFAULT_CONFIG);

    expect(commands).toContain('npm test');
    expect(commands).toContain('npm run lint');
  });

  it('should merge user-defined allowed commands', () => {
    const config = validateConfig({
      commands: {
        allowed: ['make test', 'custom-command'],
      },
    });

    const commands = getMergedAllowedCommands(config);

    expect(commands).toContain('npm test');
    expect(commands).toContain('make test');
    expect(commands).toContain('custom-command');
  });

  it('should filter out blocked commands', () => {
    const config = validateConfig({
      commands: {
        blocked: ['npm test'],
      },
    });

    const commands = getMergedAllowedCommands(config);

    expect(commands).not.toContain('npm test');
    expect(commands).toContain('npm run lint');
  });
});

describe('getMergedProtectedPatterns', () => {
  it('should return defaults when no config', () => {
    const patterns = getMergedProtectedPatterns(DEFAULT_CONFIG);

    expect(patterns).toContain('.env*');
    expect(patterns).toContain('**/*.pem');
  });

  it('should merge user-defined patterns', () => {
    const config = validateConfig({
      protectedPaths: {
        patterns: ['custom/secrets/**', 'config/*.json'],
      },
    });

    const patterns = getMergedProtectedPatterns(config);

    expect(patterns).toContain('.env*');
    expect(patterns).toContain('custom/secrets/**');
    expect(patterns).toContain('config/*.json');
  });
});
