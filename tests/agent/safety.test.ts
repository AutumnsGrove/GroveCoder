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
