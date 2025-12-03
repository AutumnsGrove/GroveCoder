import { describe, it, expect, beforeEach } from 'vitest';
import { SafetyChecker, createInitialState, updateState } from '../../src/agent/safety.js';
import type { AgentState } from '../../src/agent/types.js';
import { SafetyLimitError } from '../../src/utils/errors.js';

describe('SafetyChecker', () => {
  let checker: SafetyChecker;
  let state: AgentState;

  beforeEach(() => {
    checker = new SafetyChecker();
    state = createInitialState();
  });

  describe('checkIteration', () => {
    it('should pass for low iteration count', () => {
      state = updateState(state, { iteration: 5 });
      expect(() => checker.checkIteration(state)).not.toThrow();
    });

    it('should throw at iteration limit', () => {
      state = updateState(state, { iteration: 25 });
      expect(() => checker.checkIteration(state)).toThrow(SafetyLimitError);
    });

    it('should respect custom limits', () => {
      const customChecker = new SafetyChecker({ maxLoopIterations: 10 });
      state = updateState(state, { iteration: 10 });
      expect(() => customChecker.checkIteration(state)).toThrow(SafetyLimitError);
    });
  });

  describe('checkTime', () => {
    it('should pass when within time limit', () => {
      expect(() => checker.checkTime(state)).not.toThrow();
    });

    it('should throw when time exceeded', () => {
      state = updateState(state, {
        startTime: Date.now() - 20 * 60 * 1000, // 20 minutes ago
      });
      expect(() => checker.checkTime(state)).toThrow(SafetyLimitError);
    });
  });

  describe('checkProgress', () => {
    it('should pass when progress is recent', () => {
      state = updateState(state, { iteration: 3, lastProgress: 2 });
      expect(() => checker.checkProgress(state)).not.toThrow();
    });

    it('should throw when stuck for 5 iterations', () => {
      state = updateState(state, { iteration: 10, lastProgress: 5 });
      expect(() => checker.checkProgress(state)).toThrow(SafetyLimitError);
    });
  });

  describe('isProtectedPath', () => {
    it('should identify workflow files as protected', () => {
      expect(checker.isProtectedPath('.github/workflows/ci.yml')).toBe(true);
    });

    it('should identify env files as protected', () => {
      expect(checker.isProtectedPath('.env')).toBe(true);
      expect(checker.isProtectedPath('.env.local')).toBe(true);
    });

    it('should identify secret files as protected', () => {
      expect(checker.isProtectedPath('secrets.json')).toBe(true);
      expect(checker.isProtectedPath('config/secrets.yaml')).toBe(true);
    });

    it('should identify key files as protected', () => {
      expect(checker.isProtectedPath('private.pem')).toBe(true);
      expect(checker.isProtectedPath('server.key')).toBe(true);
    });

    it('should allow normal source files', () => {
      expect(checker.isProtectedPath('src/index.ts')).toBe(false);
      expect(checker.isProtectedPath('components/Button.tsx')).toBe(false);
    });
  });

  describe('calculateCost', () => {
    it('should calculate cost based on token usage', () => {
      state = updateState(state, {
        totalInputTokens: 100_000,
        totalOutputTokens: 10_000,
      });

      const cost = checker.calculateCost(state);
      expect(cost).toBeGreaterThan(0);
      expect(cost).toBeLessThan(1); // Should be less than $1 for this usage
    });
  });

  describe('checkProtectedBranch', () => {
    it('should throw for main branch', () => {
      expect(() => checker.checkProtectedBranch('main')).toThrow(SafetyLimitError);
    });

    it('should throw for master branch', () => {
      expect(() => checker.checkProtectedBranch('master')).toThrow(SafetyLimitError);
    });

    it('should throw for production branch', () => {
      expect(() => checker.checkProtectedBranch('production')).toThrow(SafetyLimitError);
    });

    it('should throw for release branches matching glob', () => {
      expect(() => checker.checkProtectedBranch('release/v1.0.0')).toThrow(SafetyLimitError);
      expect(() => checker.checkProtectedBranch('release/2025-01')).toThrow(SafetyLimitError);
    });

    it('should allow feature branches', () => {
      expect(() => checker.checkProtectedBranch('feature/new-feature')).not.toThrow();
      expect(() => checker.checkProtectedBranch('fix/bug-123')).not.toThrow();
      expect(() => checker.checkProtectedBranch('dev')).not.toThrow();
    });

    it('should allow custom protected branches', () => {
      const customChecker = new SafetyChecker({
        protectedBranches: ['staging', 'main'],
      });
      expect(() => customChecker.checkProtectedBranch('staging')).toThrow(SafetyLimitError);
      expect(() => customChecker.checkProtectedBranch('develop')).not.toThrow();
    });
  });

  describe('checkCircuitBreaker', () => {
    it('should pass when no consecutive failures', () => {
      state = updateState(state, { consecutiveFailures: 0 });
      expect(() => checker.checkCircuitBreaker(state)).not.toThrow();
    });

    it('should pass when under failure limit', () => {
      state = updateState(state, { consecutiveFailures: 2 });
      expect(() => checker.checkCircuitBreaker(state)).not.toThrow();
    });

    it('should throw when at failure limit', () => {
      state = updateState(state, { consecutiveFailures: 3 });
      expect(() => checker.checkCircuitBreaker(state)).toThrow(SafetyLimitError);
    });

    it('should throw when over failure limit', () => {
      state = updateState(state, { consecutiveFailures: 5 });
      expect(() => checker.checkCircuitBreaker(state)).toThrow(SafetyLimitError);
    });

    it('should respect custom failure limit', () => {
      const customChecker = new SafetyChecker({ maxConsecutiveFailures: 5 });
      state = updateState(state, { consecutiveFailures: 4 });
      expect(() => customChecker.checkCircuitBreaker(state)).not.toThrow();

      state = updateState(state, { consecutiveFailures: 5 });
      expect(() => customChecker.checkCircuitBreaker(state)).toThrow(SafetyLimitError);
    });
  });

  describe('shouldPostProgressUpdate', () => {
    it('should return false for iteration 0', () => {
      state = updateState(state, { iteration: 0 });
      expect(checker.shouldPostProgressUpdate(state)).toBe(false);
    });

    it('should return true at interval (default 5)', () => {
      state = updateState(state, { iteration: 5 });
      expect(checker.shouldPostProgressUpdate(state)).toBe(true);
    });

    it('should return true at multiples of interval', () => {
      state = updateState(state, { iteration: 10 });
      expect(checker.shouldPostProgressUpdate(state)).toBe(true);
      state = updateState(state, { iteration: 15 });
      expect(checker.shouldPostProgressUpdate(state)).toBe(true);
    });

    it('should return false between intervals', () => {
      state = updateState(state, { iteration: 3 });
      expect(checker.shouldPostProgressUpdate(state)).toBe(false);
      state = updateState(state, { iteration: 7 });
      expect(checker.shouldPostProgressUpdate(state)).toBe(false);
    });

    it('should respect custom interval', () => {
      const customChecker = new SafetyChecker({ progressUpdateInterval: 3 });
      state = updateState(state, { iteration: 3 });
      expect(customChecker.shouldPostProgressUpdate(state)).toBe(true);
      state = updateState(state, { iteration: 5 });
      expect(customChecker.shouldPostProgressUpdate(state)).toBe(false);
    });
  });

  describe('buildProgressUpdate', () => {
    it('should build a formatted progress message', () => {
      state = updateState(state, {
        iteration: 5,
        fixedIssues: 2,
        consecutiveFailures: 0,
      });

      const message = checker.buildProgressUpdate(state, 5);

      expect(message).toContain('Progress Update');
      expect(message).toContain('5/25'); // iteration/max
      expect(message).toContain('2/5'); // fixed/total
    });

    it('should include warning for consecutive failures', () => {
      state = updateState(state, {
        iteration: 5,
        consecutiveFailures: 2,
      });

      const message = checker.buildProgressUpdate(state, 5);
      expect(message).toContain('2 consecutive tool failure(s)');
    });
  });

  describe('buildCircuitBreakerDiagnostic', () => {
    it('should build a diagnostic message', () => {
      state = updateState(state, {
        iteration: 8,
        consecutiveFailures: 3,
        fixedIssues: 2,
        failedIssues: 1,
      });

      const message = checker.buildCircuitBreakerDiagnostic(state);

      expect(message).toContain('Circuit Breaker Tripped');
      expect(message).toContain('3 consecutive tool failures');
      expect(message).toContain('Iterations Completed:** 8');
      expect(message).toContain('Issues Fixed:** 2');
    });
  });
});

describe('createInitialState', () => {
  it('should create a valid initial state', () => {
    const state = createInitialState();

    expect(state.iteration).toBe(0);
    expect(state.totalInputTokens).toBe(0);
    expect(state.totalOutputTokens).toBe(0);
    expect(state.startTime).toBeGreaterThan(0);
    expect(state.lastProgress).toBe(0);
    expect(state.fixedIssues).toBe(0);
    expect(state.failedIssues).toBe(0);
    expect(state.consecutiveFailures).toBe(0);
    expect(state.isComplete).toBe(false);
  });
});

describe('updateState', () => {
  it('should update specific fields', () => {
    const state = createInitialState();
    const updated = updateState(state, { iteration: 5, fixedIssues: 2 });

    expect(updated.iteration).toBe(5);
    expect(updated.fixedIssues).toBe(2);
    expect(updated.totalInputTokens).toBe(0); // Unchanged
  });

  it('should not mutate the original state', () => {
    const state = createInitialState();
    const updated = updateState(state, { iteration: 5 });

    expect(state.iteration).toBe(0);
    expect(updated.iteration).toBe(5);
  });
});
