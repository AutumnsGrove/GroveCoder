/**
 * Configuration types for GroveCoder
 * Config is loaded from .github/grovecoder.yml
 */

/**
 * User-configurable safety limits
 * Users can only make limits STRICTER, not looser
 */
export interface ConfigSafetyLimits {
  /** Maximum iterations (1-25, default: 25) */
  maxIterations?: number;
  /** Maximum cost in USD (0.1-2.0, default: 2.0) */
  maxCostUsd?: number;
  /** Maximum execution time in seconds (60-900, default: 900) */
  maxExecutionTimeSeconds?: number;
  /** Progress update interval in iterations (1-10, default: 5) */
  progressUpdateInterval?: number;
}

/**
 * Command whitelist configuration
 */
export interface ConfigCommands {
  /** Additional allowed command patterns (merged with defaults) */
  allowed?: string[];
  /** Commands to block (overrides allowed) */
  blocked?: string[];
}

/**
 * Protected paths configuration
 */
export interface ConfigProtectedPaths {
  /** Additional protected path patterns (merged with defaults) */
  patterns?: string[];
  /** Protected branches (glob patterns supported) */
  branches?: string[];
}

/**
 * Behavior configuration
 */
export interface ConfigBehavior {
  /** Whether to auto-approve after successful fixes (default: false) */
  autoApprove?: boolean;
  /** Whether to request re-review after fixes (default: true) */
  requestReReview?: boolean;
  /** Minimum severity to act on: 'critical' | 'major' | 'minor' | 'suggestion' (default: 'minor') */
  minSeverity?: 'critical' | 'major' | 'minor' | 'suggestion';
  /** Skip issues matching these patterns */
  ignorePatterns?: string[];
}

/**
 * Supported LLM providers
 */
export type LLMProviderType = 'claude' | 'kimi';

/**
 * LLM/Model configuration
 */
export interface ConfigModel {
  /**
   * LLM provider to use: 'claude' or 'kimi'
   * - claude: Anthropic Claude (more capable, higher cost)
   * - kimi: Moonshot Kimi K2 (cheaper, good for simpler fixes)
   * Default: 'claude'
   */
  provider?: LLMProviderType;
  /**
   * Specific model ID to use (provider-specific)
   * Claude models: 'claude-sonnet-4-20250514', 'claude-opus-4-20250514'
   * Kimi models: 'kimi-k2-0711-preview', 'moonshot-v1-128k'
   * Default: Provider's default model
   */
  model?: string;
  /**
   * Maximum tokens for model response
   * Default: 8192
   */
  maxTokens?: number;
}

/**
 * Full GroveCoder configuration schema
 */
export interface GroveCoderConfig {
  /** Config version (currently only '1' supported) */
  version: '1';
  /** Safety limit overrides (stricter only) */
  safety?: ConfigSafetyLimits;
  /** Command whitelist configuration */
  commands?: ConfigCommands;
  /** Protected paths configuration */
  protectedPaths?: ConfigProtectedPaths;
  /** Behavior settings */
  behavior?: ConfigBehavior;
  /** LLM provider and model settings */
  model?: ConfigModel;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Required<GroveCoderConfig> = {
  version: '1',
  safety: {
    maxIterations: 25,
    maxCostUsd: 2.0,
    maxExecutionTimeSeconds: 900,
    progressUpdateInterval: 5,
  },
  commands: {
    allowed: [],
    blocked: [],
  },
  protectedPaths: {
    patterns: [],
    branches: [],
  },
  behavior: {
    autoApprove: false,
    requestReReview: true,
    minSeverity: 'minor',
    ignorePatterns: [],
  },
  model: {
    provider: 'claude',
    model: undefined, // Use provider's default
    maxTokens: 8192,
  },
};

/**
 * Hard limits that users cannot exceed (safety guarantees)
 */
export const HARD_LIMITS = {
  maxIterations: { min: 1, max: 25 },
  maxCostUsd: { min: 0.1, max: 2.0 },
  maxExecutionTimeSeconds: { min: 60, max: 900 },
  progressUpdateInterval: { min: 1, max: 10 },
} as const;

/**
 * Default allowed commands (base whitelist)
 */
export const DEFAULT_ALLOWED_COMMANDS = [
  'npm test',
  'npm run test',
  'npm run lint',
  'npm run build',
  'npm run typecheck',
  'npm run type-check',
  'npx tsc --noEmit',
  'npx eslint',
  'npx prettier --check',
  'yarn test',
  'yarn lint',
  'yarn build',
  'pnpm test',
  'pnpm lint',
  'pnpm build',
  'cargo test',
  'cargo check',
  'cargo clippy',
  'go test',
  'go vet',
  'pytest',
  'python -m pytest',
  'ruff check',
  'mypy',
];

/**
 * Default protected file patterns
 */
export const DEFAULT_PROTECTED_PATTERNS = [
  '.github/workflows/**',
  '.env*',
  '**/secrets*',
  '**/*.pem',
  '**/*.key',
  '**/credentials*',
  '**/password*',
  '.git/**',
];

/**
 * Default protected branches
 */
export const DEFAULT_PROTECTED_BRANCHES = [
  'main',
  'master',
  'production',
  'release/*',
];
