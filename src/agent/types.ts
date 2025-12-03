/**
 * Agent types for GroveCoder
 */

export type IssueSeverity = 'critical' | 'major' | 'minor' | 'suggestion';

export interface ReviewIssue {
  severity: IssueSeverity;
  title: string;
  description: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  suggestedFix?: string;
  codeBlock?: string;
}

export interface ParsedReview {
  issuesAndConcerns: ReviewIssue[];
  recommendations: string[];
  finalRecommendation: 'approve' | 'request-changes' | 'needs-discussion' | 'unknown';
  complexityEstimate: 'low' | 'medium' | 'high' | 'unknown';
  rawContent: string;
}

export interface AgentState {
  iteration: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  startTime: number;
  lastProgress: number;
  fixedIssues: number;
  failedIssues: number;
  isComplete: boolean;
  exitReason?: string;
}

export interface SafetyLimits {
  maxLoopIterations: number;
  maxApiCalls: number;
  maxTokensPerCall: number;
  maxExecutionTimeMs: number;
  maxCostUsd: number;
}

export const DEFAULT_SAFETY_LIMITS: SafetyLimits = {
  maxLoopIterations: 25,
  maxApiCalls: 50,
  maxTokensPerCall: 100_000,
  maxExecutionTimeMs: 15 * 60 * 1000, // 15 minutes
  maxCostUsd: 2.0,
};

export interface DiffLimits {
  maxLinesPerFile: number;
  maxFilesPerCommit: number;
  maxTotalLines: number;
}

export const DEFAULT_DIFF_LIMITS: DiffLimits = {
  maxLinesPerFile: 500,
  maxFilesPerCommit: 20,
  maxTotalLines: 1000,
};
