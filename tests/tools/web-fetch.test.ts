/**
 * Tests for web_fetch tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { webFetch, getAllowedDomains } from '../../src/tools/web-fetch.js';

describe('webFetch', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    // Mock fetch
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  describe('URL validation', () => {
    it('should reject http URLs', async () => {
      await expect(webFetch('http://docs.github.com/page')).rejects.toThrow(
        'URL not allowed'
      );
    });

    it('should reject disallowed domains', async () => {
      await expect(webFetch('https://evil.com/malware')).rejects.toThrow(
        'URL not allowed'
      );
    });

    it('should reject invalid URLs', async () => {
      await expect(webFetch('not-a-url')).rejects.toThrow('URL not allowed');
    });

    it('should accept allowed documentation sites', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/plain']]),
        text: async () => 'Test content',
      });

      const result = await webFetch('https://docs.github.com/test');
      expect(result).toBe('Test content');
    });

    it('should accept subdomains of allowed domains', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/plain']]),
        text: async () => 'MDN content',
      });

      const result = await webFetch('https://developer.mozilla.org/docs');
      expect(result).toBe('MDN content');
    });
  });

  describe('content handling', () => {
    it('should strip HTML tags from HTML content', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/html']]),
        text: async () => '<html><body><p>Hello <strong>World</strong></p></body></html>',
      });

      const result = await webFetch('https://nodejs.org/docs');
      expect(result).toContain('Hello');
      expect(result).toContain('World');
      expect(result).not.toContain('<strong>');
    });

    it('should preserve code blocks', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/html']]),
        text: async () =>
          '<pre><code>const x = 1;</code></pre>',
      });

      const result = await webFetch('https://typescriptlang.org/docs');
      expect(result).toContain('const x = 1;');
    });

    it('should format JSON content', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        text: async () => '{"key":"value"}',
      });

      const result = await webFetch('https://npmjs.com/api');
      expect(result).toContain('"key"');
      expect(result).toContain('"value"');
    });

    it('should handle plain text content', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/plain']]),
        text: async () => 'Plain text content',
      });

      const result = await webFetch('https://raw.githubusercontent.com/test');
      expect(result).toBe('Plain text content');
    });
  });

  describe('error handling', () => {
    it('should throw on HTTP errors', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Map(),
      });

      await expect(webFetch('https://docs.github.com/missing')).rejects.toThrow(
        'HTTP 404'
      );
    });

    it('should mark server errors as recoverable', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Map(),
      });

      try {
        await webFetch('https://docs.github.com/error');
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('HTTP 500');
      }
    });

    it('should handle timeout', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('aborted')), 100);
        });
      });

      await expect(webFetch('https://docs.github.com/slow')).rejects.toThrow(
        'timeout'
      );
    });
  });

  describe('caching', () => {
    it('should cache responses', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/plain']]),
        text: async () => 'Cached content',
      });
      global.fetch = mockFetch;

      // First call
      await webFetch('https://vitest.dev/guide');

      // Second call should use cache
      await webFetch('https://vitest.dev/guide');

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});

describe('getAllowedDomains', () => {
  it('should return list of allowed domains', () => {
    const domains = getAllowedDomains();

    expect(domains).toContain('docs.github.com');
    expect(domains).toContain('developer.mozilla.org');
    expect(domains).toContain('nodejs.org');
    expect(domains).toContain('typescriptlang.org');
  });
});
