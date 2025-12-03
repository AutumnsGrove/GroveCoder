import { describe, it, expect } from 'vitest';
import { isClaudeReview, parseClaudeReview } from '../../src/agent/parser.js';
import {
  SAMPLE_REVIEW_BASIC,
  SAMPLE_REVIEW_WITH_SUGGESTIONS,
  SAMPLE_REVIEW_APPROVE,
  SAMPLE_REVIEW_NUMBERED,
  NON_REVIEW_COMMENT,
} from '../fixtures/sample-review.js';

describe('isClaudeReview', () => {
  it('should identify a basic Claude review', () => {
    expect(isClaudeReview(SAMPLE_REVIEW_BASIC)).toBe(true);
  });

  it('should identify a review with suggestions', () => {
    expect(isClaudeReview(SAMPLE_REVIEW_WITH_SUGGESTIONS)).toBe(true);
  });

  it('should identify an approval review', () => {
    expect(isClaudeReview(SAMPLE_REVIEW_APPROVE)).toBe(true);
  });

  it('should identify a numbered review', () => {
    expect(isClaudeReview(SAMPLE_REVIEW_NUMBERED)).toBe(true);
  });

  it('should reject non-review comments', () => {
    expect(isClaudeReview(NON_REVIEW_COMMENT)).toBe(false);
  });

  it('should reject empty content', () => {
    expect(isClaudeReview('')).toBe(false);
  });
});

describe('parseClaudeReview', () => {
  describe('basic review parsing', () => {
    it('should parse issues from basic review', () => {
      const result = parseClaudeReview(SAMPLE_REVIEW_BASIC);

      expect(result.issuesAndConcerns.length).toBeGreaterThan(0);
      expect(result.finalRecommendation).toBe('request-changes');
    });

    it('should extract critical issues', () => {
      const result = parseClaudeReview(SAMPLE_REVIEW_BASIC);

      const criticalIssues = result.issuesAndConcerns.filter(
        (i) => i.severity === 'critical'
      );
      expect(criticalIssues.length).toBeGreaterThan(0);
    });

    it('should extract file paths', () => {
      const result = parseClaudeReview(SAMPLE_REVIEW_BASIC);

      const issuesWithPaths = result.issuesAndConcerns.filter((i) => i.filePath);
      expect(issuesWithPaths.length).toBeGreaterThan(0);
    });

    it('should extract recommendations', () => {
      const result = parseClaudeReview(SAMPLE_REVIEW_BASIC);

      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('review with code suggestions', () => {
    it('should extract code blocks as suggested fixes', () => {
      const result = parseClaudeReview(SAMPLE_REVIEW_WITH_SUGGESTIONS);

      const issuesWithFixes = result.issuesAndConcerns.filter(
        (i) => i.suggestedFix ?? i.codeBlock
      );
      expect(issuesWithFixes.length).toBeGreaterThan(0);
    });
  });

  describe('approval review', () => {
    it('should identify approve recommendation', () => {
      const result = parseClaudeReview(SAMPLE_REVIEW_APPROVE);

      expect(result.finalRecommendation).toBe('approve');
    });

    it('should have low complexity for minor issues', () => {
      const result = parseClaudeReview(SAMPLE_REVIEW_APPROVE);

      expect(result.complexityEstimate).toBe('low');
    });
  });

  describe('numbered review format', () => {
    it('should parse numbered issues', () => {
      const result = parseClaudeReview(SAMPLE_REVIEW_NUMBERED);

      expect(result.issuesAndConcerns.length).toBeGreaterThanOrEqual(3);
    });

    it('should correctly identify severities', () => {
      const result = parseClaudeReview(SAMPLE_REVIEW_NUMBERED);

      const severities = result.issuesAndConcerns.map((i) => i.severity);
      expect(severities).toContain('critical');
      expect(severities).toContain('major');
    });
  });

  describe('complexity estimation', () => {
    it('should estimate high complexity for many critical issues', () => {
      const reviewWithManyCritical = `
## Issues & Concerns
1. [Critical] Issue 1
2. [Critical] Issue 2
3. [Critical] Issue 3
4. [Major] Issue 4
5. [Major] Issue 5
6. [Major] Issue 6
7. [Minor] Issue 7
8. [Minor] Issue 8
9. [Minor] Issue 9
10. [Minor] Issue 10
11. [Minor] Issue 11
`;
      const result = parseClaudeReview(reviewWithManyCritical);
      expect(result.complexityEstimate).toBe('high');
    });

    it('should estimate medium complexity for some major issues', () => {
      const reviewWithSomeMajor = `
## Issues & Concerns
1. [Major] Issue 1
2. [Major] Issue 2
3. [Major] Issue 3
4. [Minor] Issue 4
`;
      const result = parseClaudeReview(reviewWithSomeMajor);
      expect(result.complexityEstimate).toBe('medium');
    });
  });
});
