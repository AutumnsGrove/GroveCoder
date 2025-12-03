import { describe, it, expect } from 'vitest';
import { runCommand, gitStatus } from '../../src/tools/shell.js';
import { ToolExecutionError } from '../../src/utils/errors.js';

describe('runCommand', () => {
  describe('allowed commands', () => {
    it('should allow git status', async () => {
      const result = await runCommand('git status');
      expect(result).toBeDefined();
    });

    it('should allow git diff', async () => {
      const result = await runCommand('git diff');
      expect(result).toBeDefined();
    });

    it('should allow git log', async () => {
      const result = await runCommand('git log --oneline -5');
      expect(result).toBeDefined();
    });
  });

  describe('disallowed commands', () => {
    it('should reject rm command', async () => {
      await expect(runCommand('rm -rf /')).rejects.toThrow(ToolExecutionError);
    });

    it('should reject curl command', async () => {
      await expect(runCommand('curl https://evil.com')).rejects.toThrow(ToolExecutionError);
    });

    it('should reject arbitrary shell commands', async () => {
      await expect(runCommand('echo "hello"')).rejects.toThrow(ToolExecutionError);
    });

    it('should reject command chaining', async () => {
      await expect(runCommand('git status && rm -rf /')).rejects.toThrow(ToolExecutionError);
    });
  });
});

describe('gitStatus', () => {
  it('should return git status output', async () => {
    const result = await gitStatus();
    expect(typeof result).toBe('string');
  });
});
