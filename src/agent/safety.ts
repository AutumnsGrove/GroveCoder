/**
 * Safety checks and limits for GroveCoder agent
 */

import { logger, SafetyLimitError } from '../utils/index.js';
import type { AgentState, SafetyLimits, DiffLimits } from './types.js';
import { DEFAULT_SAFETY_LIMITS, DEFAULT_DIFF_LIMITS } from './types.js';
import { COST_PER_MILLION_TOKENS, MODELS } from '../claude/types.js';

export class SafetyChecker {
  private limits: SafetyLimits;
  private diffLimits: DiffLimits;

  constructor(
    limits: Partial<SafetyLimits> = {},
    diffLimits: Partial<DiffLimits> = {}
  ) {
    this.limits = { ...DEFAULT_SAFETY_LIMITS, ...limits };
    this.diffLimits = { ...DEFAULT_DIFF_LIMITS, ...diffLimits };
  }

  checkIteration(state: AgentState): void {
    if (state.iteration >= this.limits.maxLoopIterations) {
      throw new SafetyLimitError(
        `Maximum iteration limit reached (${this.limits.maxLoopIterations})`,
        'iteration'
      );
    }
  }

  /**
   * Check if the target branch is protected
   * Throws SafetyLimitError if PR targets a protected branch
   */
  checkProtectedBranch(baseBranch: string): void {
    const isProtected = this.limits.protectedBranches.some((pattern) => {
      if (pattern.includes('*')) {
        // Handle glob patterns like 'release/*'
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return regex.test(baseBranch);
      }
      return pattern === baseBranch;
    });

    if (isProtected) {
      throw new SafetyLimitError(
        `Cannot modify PR targeting protected branch: ${baseBranch}`,
        'protected_branch'
      );
    }
  }

  /**
   * Check if circuit breaker should trip (3 consecutive failures)
   */
  checkCircuitBreaker(state: AgentState): void {
    if (state.consecutiveFailures >= this.limits.maxConsecutiveFailures) {
      throw new SafetyLimitError(
        `Circuit breaker tripped: ${state.consecutiveFailures} consecutive tool failures`,
        'circuit_breaker'
      );
    }
  }

  /**
   * Check if a progress update should be posted
   */
  shouldPostProgressUpdate(state: AgentState): boolean {
    return state.iteration > 0 && state.iteration % this.limits.progressUpdateInterval === 0;
  }

  checkTime(state: AgentState): void {
    const elapsed = Date.now() - state.startTime;
    if (elapsed >= this.limits.maxExecutionTimeMs) {
      throw new SafetyLimitError(
        `Maximum execution time exceeded (${this.limits.maxExecutionTimeMs / 1000 / 60} minutes)`,
        'time'
      );
    }
  }

  checkCost(state: AgentState): void {
    const cost = this.calculateCost(state);
    if (cost >= this.limits.maxCostUsd) {
      throw new SafetyLimitError(
        `Maximum cost limit reached ($${this.limits.maxCostUsd})`,
        'cost'
      );
    }
  }

  checkProgress(state: AgentState): void {
    // Check for stuck state - no progress in 5 iterations
    const iterationsSinceProgress = state.iteration - state.lastProgress;
    if (iterationsSinceProgress >= 5) {
      throw new SafetyLimitError(
        `No progress made in ${iterationsSinceProgress} iterations`,
        'stuck'
      );
    }
  }

  checkAll(state: AgentState): void {
    this.checkIteration(state);
    this.checkTime(state);
    this.checkCost(state);
    this.checkProgress(state);
    this.checkCircuitBreaker(state);
  }

  calculateCost(state: AgentState): number {
    const rates = COST_PER_MILLION_TOKENS[MODELS.SONNET];
    const inputCost = (state.totalInputTokens / 1_000_000) * rates.input;
    const outputCost = (state.totalOutputTokens / 1_000_000) * rates.output;
    return inputCost + outputCost;
  }

  logStatus(state: AgentState): void {
    const elapsed = (Date.now() - state.startTime) / 1000;
    const cost = this.calculateCost(state);

    logger.info('Agent status', {
      iteration: state.iteration,
      maxIterations: this.limits.maxLoopIterations,
      elapsedSeconds: Math.round(elapsed),
      maxSeconds: this.limits.maxExecutionTimeMs / 1000,
      cost: cost.toFixed(4),
      maxCost: this.limits.maxCostUsd,
      fixedIssues: state.fixedIssues,
      failedIssues: state.failedIssues,
    });
  }

  isProtectedPath(path: string): boolean {
    const protectedPatterns = [
      /^\.github\/workflows\//,
      /^\.env/,
      /secrets?\./i,
      /\.pem$/,
      /\.key$/,
      /credentials/i,
      /password/i,
    ];

    return protectedPatterns.some((pattern) => pattern.test(path));
  }

  validateFilePath(path: string): void {
    if (this.isProtectedPath(path)) {
      throw new SafetyLimitError(
        `Cannot modify protected file: ${path}`,
        'protected_file'
      );
    }
  }

  getDiffLimits(): DiffLimits {
    return { ...this.diffLimits };
  }

  checkDiffSize(linesChanged: number, filesChanged: number): void {
    if (linesChanged > this.diffLimits.maxTotalLines) {
      throw new SafetyLimitError(
        `Diff too large: ${linesChanged} lines exceeds limit of ${this.diffLimits.maxTotalLines}`,
        'diff_size'
      );
    }
    if (filesChanged > this.diffLimits.maxFilesPerCommit) {
      throw new SafetyLimitError(
        `Too many files changed: ${filesChanged} exceeds limit of ${this.diffLimits.maxFilesPerCommit}`,
        'file_count'
      );
    }
  }

  /**
   * Build a progress update message for posting to the PR
   */
  buildProgressUpdate(state: AgentState, totalIssues: number): string {
    const elapsed = Math.round((Date.now() - state.startTime) / 1000);
    const cost = this.calculateCost(state);

    let message = `## 🔄 GroveCoder Progress Update\n\n`;
    message += `| Metric | Value |\n`;
    message += `|--------|-------|\n`;
    message += `| Iteration | ${state.iteration}/${this.limits.maxLoopIterations} |\n`;
    message += `| Issues Fixed | ${state.fixedIssues}/${totalIssues} |\n`;
    message += `| Time Elapsed | ${elapsed}s |\n`;
    message += `| Estimated Cost | $${cost.toFixed(4)} |\n`;

    if (state.consecutiveFailures > 0) {
      message += `\n⚠️ Note: ${state.consecutiveFailures} consecutive tool failure(s) detected.\n`;
    }

    return message;
  }

  /**
   * Build a circuit breaker diagnostic message
   */
  buildCircuitBreakerDiagnostic(state: AgentState): string {
    const elapsed = Math.round((Date.now() - state.startTime) / 1000);

    let message = `## ⚠️ GroveCoder Circuit Breaker Tripped\n\n`;
    message += `The agent has been stopped after ${state.consecutiveFailures} consecutive tool failures.\n\n`;
    message += `### Status at Stop\n`;
    message += `- **Iterations Completed:** ${state.iteration}\n`;
    message += `- **Issues Fixed:** ${state.fixedIssues}\n`;
    message += `- **Issues Failed:** ${state.failedIssues}\n`;
    message += `- **Time Elapsed:** ${elapsed}s\n\n`;
    message += `### What to do\n`;
    message += `1. Review the error logs above for details on the failures\n`;
    message += `2. Address any blocking issues manually\n`;
    message += `3. Re-trigger GroveCoder by posting a new review comment\n`;

    return message;
  }
}

export function createInitialState(): AgentState {
  return {
    iteration: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    startTime: Date.now(),
    lastProgress: 0,
    fixedIssues: 0,
    failedIssues: 0,
    consecutiveFailures: 0,
    isComplete: false,
  };
}

export function updateState(
  state: AgentState,
  updates: Partial<AgentState>
): AgentState {
  return { ...state, ...updates };
}
