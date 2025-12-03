/**
 * Configuration loader for GroveCoder
 * Loads and validates config from .github/grovecoder.yml
 */

import YAML from 'yaml';
import { logger } from '../utils/index.js';
import { GitHubClient } from '../github/client.js';
import type { RepoContext } from '../github/types.js';
import {
  type GroveCoderConfig,
  type ConfigSafetyLimits,
  DEFAULT_CONFIG,
  HARD_LIMITS,
  DEFAULT_ALLOWED_COMMANDS,
  DEFAULT_PROTECTED_PATTERNS,
  DEFAULT_PROTECTED_BRANCHES,
} from './types.js';
import type { SafetyLimits, DiffLimits } from '../agent/types.js';
import { DEFAULT_SAFETY_LIMITS, DEFAULT_DIFF_LIMITS } from '../agent/types.js';

const CONFIG_PATH = '.github/grovecoder.yml';

/**
 * Validation error with details
 */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public field: string,
    public value: unknown
  ) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Load configuration from repository
 * Returns default config if file doesn't exist
 */
export async function loadConfig(
  github: GitHubClient,
  repo: RepoContext,
  branch: string
): Promise<GroveCoderConfig> {
  try {
    const file = await github.getFileContent(repo, CONFIG_PATH, branch);
    const parsed = YAML.parse(file.content) as unknown;

    if (!parsed || typeof parsed !== 'object') {
      logger.warn('Config file is empty or invalid, using defaults');
      return DEFAULT_CONFIG;
    }

    const config = validateConfig(parsed as Record<string, unknown>);
    logger.info('Loaded config from repository', {
      path: CONFIG_PATH,
      version: config.version,
    });

    return config;
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      throw error;
    }

    // File not found is expected - use defaults
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Not Found') || message.includes('404')) {
      logger.debug('No config file found, using defaults');
      return DEFAULT_CONFIG;
    }

    logger.warn('Failed to load config, using defaults', { error: message });
    return DEFAULT_CONFIG;
  }
}

/**
 * Validate and normalize configuration
 */
export function validateConfig(raw: Record<string, unknown>): GroveCoderConfig {
  // Check version
  const version = raw['version'];
  if (version !== undefined && version !== '1') {
    throw new ConfigValidationError(
      `Unsupported config version: ${version}. Only version '1' is supported.`,
      'version',
      version
    );
  }

  const config: GroveCoderConfig = {
    version: '1',
  };

  // Validate safety limits
  if (raw['safety'] !== undefined) {
    config.safety = validateSafetyLimits(raw['safety'] as Record<string, unknown>);
  }

  // Validate commands
  if (raw['commands'] !== undefined) {
    const commands = raw['commands'] as Record<string, unknown>;
    config.commands = {
      allowed: validateStringArray(commands['allowed'], 'commands.allowed'),
      blocked: validateStringArray(commands['blocked'], 'commands.blocked'),
    };
  }

  // Validate protected paths
  if (raw['protectedPaths'] !== undefined) {
    const paths = raw['protectedPaths'] as Record<string, unknown>;
    config.protectedPaths = {
      patterns: validateStringArray(paths['patterns'], 'protectedPaths.patterns'),
      branches: validateStringArray(paths['branches'], 'protectedPaths.branches'),
    };
  }

  // Validate behavior
  if (raw['behavior'] !== undefined) {
    const behavior = raw['behavior'] as Record<string, unknown>;
    config.behavior = {};

    if (behavior['autoApprove'] !== undefined) {
      if (typeof behavior['autoApprove'] !== 'boolean') {
        throw new ConfigValidationError(
          'behavior.autoApprove must be a boolean',
          'behavior.autoApprove',
          behavior['autoApprove']
        );
      }
      config.behavior.autoApprove = behavior['autoApprove'];
    }

    if (behavior['requestReReview'] !== undefined) {
      if (typeof behavior['requestReReview'] !== 'boolean') {
        throw new ConfigValidationError(
          'behavior.requestReReview must be a boolean',
          'behavior.requestReReview',
          behavior['requestReReview']
        );
      }
      config.behavior.requestReReview = behavior['requestReReview'];
    }

    if (behavior['minSeverity'] !== undefined) {
      const validSeverities = ['critical', 'major', 'minor', 'suggestion'];
      if (!validSeverities.includes(behavior['minSeverity'] as string)) {
        throw new ConfigValidationError(
          `behavior.minSeverity must be one of: ${validSeverities.join(', ')}`,
          'behavior.minSeverity',
          behavior['minSeverity']
        );
      }
      config.behavior.minSeverity = behavior['minSeverity'] as
        | 'critical'
        | 'major'
        | 'minor'
        | 'suggestion';
    }

    if (behavior['ignorePatterns'] !== undefined) {
      config.behavior.ignorePatterns = validateStringArray(
        behavior['ignorePatterns'],
        'behavior.ignorePatterns'
      );
    }
  }

  // Warn about unknown fields
  const knownFields = ['version', 'safety', 'commands', 'protectedPaths', 'behavior'];
  for (const field of Object.keys(raw)) {
    if (!knownFields.includes(field)) {
      logger.warn('Unknown config field ignored', { field });
    }
  }

  return config;
}

/**
 * Validate safety limits (enforce stricter-only)
 */
function validateSafetyLimits(raw: Record<string, unknown>): ConfigSafetyLimits {
  const limits: ConfigSafetyLimits = {};

  // maxIterations
  if (raw['maxIterations'] !== undefined) {
    const value = raw['maxIterations'];
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw new ConfigValidationError(
        'safety.maxIterations must be an integer',
        'safety.maxIterations',
        value
      );
    }
    const { min, max } = HARD_LIMITS.maxIterations;
    if (value < min || value > max) {
      throw new ConfigValidationError(
        `safety.maxIterations must be between ${min} and ${max}`,
        'safety.maxIterations',
        value
      );
    }
    limits.maxIterations = value;
  }

  // maxCostUsd
  if (raw['maxCostUsd'] !== undefined) {
    const value = raw['maxCostUsd'];
    if (typeof value !== 'number') {
      throw new ConfigValidationError(
        'safety.maxCostUsd must be a number',
        'safety.maxCostUsd',
        value
      );
    }
    const { min, max } = HARD_LIMITS.maxCostUsd;
    if (value < min || value > max) {
      throw new ConfigValidationError(
        `safety.maxCostUsd must be between ${min} and ${max}`,
        'safety.maxCostUsd',
        value
      );
    }
    limits.maxCostUsd = value;
  }

  // maxExecutionTimeSeconds
  if (raw['maxExecutionTimeSeconds'] !== undefined) {
    const value = raw['maxExecutionTimeSeconds'];
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw new ConfigValidationError(
        'safety.maxExecutionTimeSeconds must be an integer',
        'safety.maxExecutionTimeSeconds',
        value
      );
    }
    const { min, max } = HARD_LIMITS.maxExecutionTimeSeconds;
    if (value < min || value > max) {
      throw new ConfigValidationError(
        `safety.maxExecutionTimeSeconds must be between ${min} and ${max}`,
        'safety.maxExecutionTimeSeconds',
        value
      );
    }
    limits.maxExecutionTimeSeconds = value;
  }

  // progressUpdateInterval
  if (raw['progressUpdateInterval'] !== undefined) {
    const value = raw['progressUpdateInterval'];
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw new ConfigValidationError(
        'safety.progressUpdateInterval must be an integer',
        'safety.progressUpdateInterval',
        value
      );
    }
    const { min, max } = HARD_LIMITS.progressUpdateInterval;
    if (value < min || value > max) {
      throw new ConfigValidationError(
        `safety.progressUpdateInterval must be between ${min} and ${max}`,
        'safety.progressUpdateInterval',
        value
      );
    }
    limits.progressUpdateInterval = value;
  }

  return limits;
}

/**
 * Validate that a value is an array of strings
 */
function validateStringArray(value: unknown, field: string): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ConfigValidationError(`${field} must be an array`, field, value);
  }
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== 'string') {
      throw new ConfigValidationError(`${field}[${i}] must be a string`, field, value[i]);
    }
  }
  return value as string[];
}

/**
 * Merge user config with defaults to create effective SafetyLimits
 */
export function mergeWithSafetyDefaults(config: GroveCoderConfig): SafetyLimits {
  const userSafety = config.safety ?? {};
  const userPaths = config.protectedPaths ?? {};

  // Merge protected branches
  const protectedBranches = [
    ...DEFAULT_PROTECTED_BRANCHES,
    ...(userPaths.branches ?? []),
  ];

  // Default execution time in seconds (15 minutes)
  const defaultExecutionTimeSeconds = DEFAULT_SAFETY_LIMITS.maxExecutionTimeMs / 1000;

  return {
    maxLoopIterations: userSafety.maxIterations ?? DEFAULT_SAFETY_LIMITS.maxLoopIterations,
    maxApiCalls: DEFAULT_SAFETY_LIMITS.maxApiCalls,
    maxTokensPerCall: DEFAULT_SAFETY_LIMITS.maxTokensPerCall,
    maxExecutionTimeMs: (userSafety.maxExecutionTimeSeconds ?? defaultExecutionTimeSeconds) * 1000,
    maxCostUsd: userSafety.maxCostUsd ?? DEFAULT_SAFETY_LIMITS.maxCostUsd,
    maxConsecutiveFailures: DEFAULT_SAFETY_LIMITS.maxConsecutiveFailures,
    progressUpdateInterval:
      userSafety.progressUpdateInterval ?? DEFAULT_SAFETY_LIMITS.progressUpdateInterval,
    protectedBranches: [...new Set(protectedBranches)], // Deduplicate
  };
}

/**
 * Merge user config with defaults to create effective DiffLimits
 */
export function mergeWithDiffDefaults(_config: GroveCoderConfig): DiffLimits {
  // DiffLimits are not user-configurable for now
  return { ...DEFAULT_DIFF_LIMITS };
}

/**
 * Get merged allowed commands list
 */
export function getMergedAllowedCommands(config: GroveCoderConfig): string[] {
  const userCommands = config.commands ?? {};
  const allowed = [...DEFAULT_ALLOWED_COMMANDS, ...(userCommands.allowed ?? [])];
  const blocked = new Set(userCommands.blocked ?? []);

  // Filter out blocked commands
  return allowed.filter((cmd) => !blocked.has(cmd));
}

/**
 * Get merged protected patterns list
 */
export function getMergedProtectedPatterns(config: GroveCoderConfig): string[] {
  const userPaths = config.protectedPaths ?? {};
  return [...DEFAULT_PROTECTED_PATTERNS, ...(userPaths.patterns ?? [])];
}
