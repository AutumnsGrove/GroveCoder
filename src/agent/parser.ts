/**
 * Claude review comment parser for GroveCoder
 */

import { logger, ParseError } from '../utils/index.js';
import type { ParsedReview, ReviewIssue, IssueSeverity } from './types.js';

const CLAUDE_REVIEW_SIGNATURES = [
  '# PR Review',
  '## Issues & Concerns',
  '## Code Review',
  '## Review Summary',
  '### Issues Found',
  '**Issues & Concerns**',
  '**Critical Issues**',
  '**Major Issues**',
  '🔴 Critical Issues',
  '🟡 Major Issues',
];

export function isClaudeReview(content: string): boolean {
  // Check for explicit GroveCoder trigger
  if (/@grovecoder/i.test(content) || /\bgrovecoder\b/i.test(content)) {
    return true;
  }

  // Check for Claude review signatures
  const hasSignature = CLAUDE_REVIEW_SIGNATURES.some((sig) =>
    content.includes(sig)
  );

  // Check for typical review patterns (Claude or human)
  const hasReviewPattern =
    /(?:critical|major|minor|suggestion).*?:.*?(?:issue|concern|problem)/i.test(content) ||
    /(?:approve|request.?changes|needs.?discussion)/i.test(content) ||
    /(?:needs?.?fix|please.?fix|should.?fix|fix.?this)/i.test(content) ||
    /(?:security|vulnerability|bug|error).{0,50}(?:found|detected|issue)/i.test(content);

  return hasSignature || hasReviewPattern;
}

export function parseClaudeReview(content: string): ParsedReview {
  logger.debug('Parsing Claude review', { contentLength: content.length });

  const issues = parseIssuesAndConcerns(content);
  const recommendations = parseRecommendations(content);
  const finalRec = parseFinalRecommendation(content);
  const complexity = estimateComplexity(issues);

  logger.info('Parsed review', {
    issueCount: issues.length,
    recommendationCount: recommendations.length,
    finalRecommendation: finalRec,
    complexity,
  });

  return {
    issuesAndConcerns: issues,
    recommendations,
    finalRecommendation: finalRec,
    complexityEstimate: complexity,
    rawContent: content,
  };
}

function parseIssuesAndConcerns(content: string): ReviewIssue[] {
  const issues: ReviewIssue[] = [];

  // Pattern 1: Numbered issues with severity in brackets or parentheses
  // e.g., "1. [Critical] Issue title" or "1. (Major) Issue title"
  const numberedPattern = /(?:^|\n)\s*\d+\.\s*[\[(]?(critical|major|minor|suggestion)[\])]?\s*[:\-]?\s*(.+?)(?=\n\s*\d+\.|\n\s*##|\n\s*\*\*|$)/gis;

  let match;
  while ((match = numberedPattern.exec(content)) !== null) {
    const severity = normalizeSeverity(match[1] ?? '');
    const rest = match[2]?.trim() ?? '';

    const issue = parseIssueDetails(severity, rest);
    if (issue) {
      issues.push(issue);
    }
  }

  // Pattern 2: Header-based sections (### Critical Issues, ### Major Issues, etc.)
  const sectionPattern = /###\s*(critical|major|minor|suggestion)s?\s*(?:issues?)?\s*\n([\s\S]*?)(?=\n###|\n##|$)/gi;

  while ((match = sectionPattern.exec(content)) !== null) {
    const severity = normalizeSeverity(match[1] ?? '');
    const sectionContent = match[2] ?? '';

    // Parse bullet points within the section
    const bulletPattern = /[-*]\s*(.+?)(?=\n[-*]|\n\n|$)/gs;
    let bulletMatch;

    while ((bulletMatch = bulletPattern.exec(sectionContent)) !== null) {
      const issue = parseIssueDetails(severity, bulletMatch[1]?.trim() ?? '');
      if (issue) {
        issues.push(issue);
      }
    }
  }

  // Pattern 3: Bold severity markers
  // e.g., "**Critical:** Issue description"
  const boldPattern = /\*\*(critical|major|minor|suggestion)\*\*\s*[:\-]?\s*(.+?)(?=\n\*\*|$)/gis;

  while ((match = boldPattern.exec(content)) !== null) {
    const severity = normalizeSeverity(match[1] ?? '');
    const rest = match[2]?.trim() ?? '';

    const issue = parseIssueDetails(severity, rest);
    if (issue) {
      issues.push(issue);
    }
  }

  // Deduplicate by title
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = issue.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeSeverity(raw: string): IssueSeverity {
  const lower = raw.toLowerCase().trim();
  if (lower.includes('critical')) return 'critical';
  if (lower.includes('major')) return 'major';
  if (lower.includes('minor')) return 'minor';
  if (lower.includes('suggestion') || lower.includes('nit')) return 'suggestion';
  return 'minor'; // default
}

function parseIssueDetails(severity: IssueSeverity, text: string): ReviewIssue | null {
  if (!text || text.length < 5) return null;

  // Extract file path if present (common patterns)
  const filePathPattern = /(?:in\s+|at\s+|file:\s*)?[`"]?([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)[`"]?(?:\s*(?:line|:)\s*(\d+)(?:\s*-\s*(\d+))?)?/i;
  const fileMatch = text.match(filePathPattern);

  let filePath: string | undefined;
  let lineStart: number | undefined;
  let lineEnd: number | undefined;

  if (fileMatch?.[1] && !fileMatch[1].includes(' ')) {
    filePath = fileMatch[1];
    lineStart = fileMatch[2] ? parseInt(fileMatch[2], 10) : undefined;
    lineEnd = fileMatch[3] ? parseInt(fileMatch[3], 10) : lineStart;
  }

  // Extract code block if present
  const codeBlockPattern = /```[\w]*\n?([\s\S]*?)```/;
  const codeMatch = text.match(codeBlockPattern);
  const codeBlock = codeMatch?.[1]?.trim();

  // Clean up text for title/description
  let cleanText = text
    .replace(filePathPattern, '')
    .replace(codeBlockPattern, '')
    .trim();

  // Split into title and description
  const firstSentenceEnd = cleanText.search(/[.!?]\s|[.!?]$/);
  let title: string;
  let description: string;

  if (firstSentenceEnd > 0 && firstSentenceEnd < 100) {
    title = cleanText.substring(0, firstSentenceEnd + 1).trim();
    description = cleanText.substring(firstSentenceEnd + 1).trim();
  } else if (cleanText.length > 100) {
    title = cleanText.substring(0, 100).trim() + '...';
    description = cleanText;
  } else {
    title = cleanText;
    description = '';
  }

  return {
    severity,
    title,
    description,
    filePath,
    lineStart,
    lineEnd,
    codeBlock,
    suggestedFix: codeBlock, // Code blocks are often suggested fixes
  };
}

function parseRecommendations(content: string): string[] {
  const recommendations: string[] = [];

  // Look for Recommendations section
  const recSectionPattern = /(?:##\s*)?(?:recommendations?\s*summary|key\s*recommendations?|suggested\s*actions?)\s*\n([\s\S]*?)(?=\n##|$)/i;
  const sectionMatch = content.match(recSectionPattern);

  if (sectionMatch?.[1]) {
    const section = sectionMatch[1];
    const bulletPattern = /[-*]\s*(.+?)(?=\n[-*]|\n\n|$)/gs;
    let match;

    while ((match = bulletPattern.exec(section)) !== null) {
      const rec = match[1]?.trim();
      if (rec && rec.length > 10) {
        recommendations.push(rec);
      }
    }
  }

  // Also look for numbered recommendations
  const numberedPattern = /(?:^|\n)\s*(\d+)\.\s*(.+?)(?=\n\s*\d+\.|\n\n|$)/gs;
  let match;

  while ((match = numberedPattern.exec(content)) !== null) {
    const text = match[2]?.trim() ?? '';
    if (text.length > 10 && !recommendations.includes(text)) {
      recommendations.push(text);
    }
  }

  return recommendations.slice(0, 10); // Limit to top 10
}

function parseFinalRecommendation(content: string): ParsedReview['finalRecommendation'] {
  const lower = content.toLowerCase();

  // Check for explicit recommendations
  if (/(?:recommend|my recommendation|verdict|decision).*?approve/i.test(content)) {
    return 'approve';
  }

  if (/(?:recommend|verdict|decision).*?(?:request.?changes|changes.?requested)/i.test(content)) {
    return 'request-changes';
  }

  if (/(?:needs?.?discussion|let'?s?.?discuss|need.?to.?discuss)/i.test(content)) {
    return 'needs-discussion';
  }

  // Infer from issue severity
  if (lower.includes('critical') || lower.includes('blocker')) {
    return 'request-changes';
  }

  if (lower.includes('lgtm') || lower.includes('looks good')) {
    return 'approve';
  }

  return 'unknown';
}

function estimateComplexity(issues: ReviewIssue[]): ParsedReview['complexityEstimate'] {
  if (issues.length === 0) return 'low';

  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const majorCount = issues.filter((i) => i.severity === 'major').length;
  const totalCount = issues.length;

  if (criticalCount > 2 || totalCount > 10 || majorCount > 5) {
    return 'high';
  }

  if (criticalCount > 0 || majorCount > 2 || totalCount > 5) {
    return 'medium';
  }

  return 'low';
}

export function validateReview(review: ParsedReview): void {
  if (review.issuesAndConcerns.length === 0 && review.recommendations.length === 0) {
    throw new ParseError('No issues or recommendations found in review');
  }
}
