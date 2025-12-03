/**
 * Web fetch tool for fetching documentation URLs
 */

import { logger, ToolExecutionError } from '../utils/index.js';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_CONTENT_LENGTH = 100_000; // 100KB max
const ALLOWED_DOMAINS = [
  // Documentation sites
  'docs.github.com',
  'developer.mozilla.org',
  'nodejs.org',
  'typescriptlang.org',
  'reactjs.org',
  'react.dev',
  'vuejs.org',
  'angular.io',
  'nextjs.org',
  'docs.npmjs.com',
  'eslint.org',
  'prettier.io',
  'jestjs.io',
  'vitest.dev',
  // Package registries
  'npmjs.com',
  'pypi.org',
  'crates.io',
  'pkg.go.dev',
  // GitHub (docs only)
  'github.com',
  'raw.githubusercontent.com',
];

/**
 * Check if a URL is allowed to be fetched
 */
function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // Must be https
    if (parsed.protocol !== 'https:') {
      return false;
    }

    // Check against allowed domains
    return ALLOWED_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

/**
 * Simple HTML to text converter
 * Strips tags and extracts readable content
 */
function htmlToText(html: string): string {
  let text = html;

  // Remove script and style content
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // Convert common elements to text equivalents
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<\/tr>/gi, '\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n\n');

  // Extract link text with URL
  text = text.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>([^<]*)<\/a>/gi, '$2 ($1)');

  // Extract code blocks
  text = text.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n');
  text = text.replace(/<code[^>]*>([^<]*)<\/code>/gi, '`$1`');

  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&apos;/g, "'");

  // Clean up whitespace
  text = text.replace(/\r\n/g, '\n');
  text = text.replace(/\r/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/[ \t]+/g, ' ');
  text = text.split('\n').map((line) => line.trim()).join('\n');

  return text.trim();
}

/**
 * Cache for fetched content
 */
const fetchCache = new Map<string, { content: string; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch content from a URL with caching
 */
export async function webFetch(url: string): Promise<string> {
  // Validate URL
  if (!isAllowedUrl(url)) {
    throw new ToolExecutionError(
      `URL not allowed. Only documentation sites are permitted (https required).`,
      'web_fetch',
      false
    );
  }

  // Check cache
  const cached = fetchCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    logger.debug('Using cached web content', { url });
    return cached.content;
  }

  logger.debug('Fetching URL', { url });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'GroveCoder/1.0 (Documentation Fetcher)',
        Accept: 'text/html,text/plain,application/json',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new ToolExecutionError(
        `HTTP ${response.status}: ${response.statusText}`,
        'web_fetch',
        response.status >= 500 // Server errors are recoverable
      );
    }

    const contentType = response.headers.get('content-type') ?? '';
    const contentLength = parseInt(response.headers.get('content-length') ?? '0', 10);

    if (contentLength > MAX_CONTENT_LENGTH) {
      throw new ToolExecutionError(
        `Content too large: ${contentLength} bytes (max ${MAX_CONTENT_LENGTH})`,
        'web_fetch',
        false
      );
    }

    const rawContent = await response.text();

    // Truncate if still too large
    const content =
      rawContent.length > MAX_CONTENT_LENGTH
        ? rawContent.slice(0, MAX_CONTENT_LENGTH) + '\n\n[Content truncated]'
        : rawContent;

    // Convert HTML to text
    let result: string;
    if (contentType.includes('text/html')) {
      result = htmlToText(content);
    } else if (contentType.includes('application/json')) {
      try {
        const json = JSON.parse(content);
        result = JSON.stringify(json, null, 2);
      } catch {
        result = content;
      }
    } else {
      result = content;
    }

    // Cache the result
    fetchCache.set(url, { content: result, timestamp: Date.now() });

    logger.debug('Fetched URL successfully', {
      url,
      originalLength: rawContent.length,
      resultLength: result.length,
    });

    return result;
  } catch (error) {
    if (error instanceof ToolExecutionError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('aborted') || message.includes('timeout')) {
      throw new ToolExecutionError(`Request timeout after ${FETCH_TIMEOUT_MS}ms`, 'web_fetch', true);
    }

    throw new ToolExecutionError(`Failed to fetch URL: ${message}`, 'web_fetch', true);
  }
}

/**
 * Get list of allowed domains for documentation
 */
export function getAllowedDomains(): readonly string[] {
  return ALLOWED_DOMAINS;
}
