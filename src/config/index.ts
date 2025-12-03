/**
 * Config module exports
 */

export type {
  GroveCoderConfig,
  ConfigSafetyLimits,
  ConfigCommands,
  ConfigProtectedPaths,
  ConfigBehavior,
} from './types.js';

export {
  DEFAULT_CONFIG,
  HARD_LIMITS,
  DEFAULT_ALLOWED_COMMANDS,
  DEFAULT_PROTECTED_PATTERNS,
  DEFAULT_PROTECTED_BRANCHES,
} from './types.js';

export {
  loadConfig,
  validateConfig,
  mergeWithSafetyDefaults,
  mergeWithDiffDefaults,
  getMergedAllowedCommands,
  getMergedProtectedPatterns,
  ConfigValidationError,
} from './loader.js';
