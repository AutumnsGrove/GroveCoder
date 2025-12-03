/**
 * Integration tests for the agent loop with mocked APIs
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { runAgentLoop, LABELS, type AgentLoopOptions } from '../../src/agent/loop.js';
import type { ParsedReview } from '../../src/agent/types.js';
import type { PRDetails, RepoContext } from '../../src/github/types.js';

// Mock LLM client (any provider implementing LLMClient interface)
const createMockLLMClient = () => ({
  provider: 'claude' as const,
  sendMessage: vi.fn(),
  getTotalUsage: vi.fn().mockReturnValue({ inputTokens: 0, outputTokens: 0 }),
  calculateCost: vi.fn().mockReturnValue(0),
  resetUsage: vi.fn(),
});

// Mock GitHubClient
const createMockGitHubClient = () => ({
  getFileContent: vi.fn(),
  createOrUpdateFile: vi.fn(),
  listDirectory: vi.fn(),
  getPRDetails: vi.fn(),
  getPRDiff: vi.fn(),
  getPRComments: vi.fn(),
  addPRComment: vi.fn(),
  updatePRComment: vi.fn(),
  addLabel: vi.fn(),
  removeLabel: vi.fn(),
  createPRContext: vi.fn(),
});

// Sample test data
const createMockReview = (overrides: Partial<ParsedReview> = {}): ParsedReview => ({
  issuesAndConcerns: [
    {
      severity: 'major',
      title: 'Missing error handling',
      description: 'Add try-catch block',
      filePath: 'src/index.ts',
      lineStart: 10,
    },
  ],
  recommendations: ['Add error handling'],
  finalRecommendation: 'request-changes',
  complexityEstimate: 'low',
  rawContent: 'Test review',
  ...overrides,
});

const createMockPRDetails = (overrides: Partial<PRDetails> = {}): PRDetails => ({
  number: 123,
  title: 'Test PR',
  body: 'Test body',
  state: 'open',
  head: { ref: 'feature/test', sha: 'abc123' },
  base: { ref: 'develop', sha: 'def456' },
  user: { login: 'testuser' },
  draft: false,
  mergeable: true,
  changedFiles: 1,
  additions: 10,
  deletions: 5,
  ...overrides,
});

const createMockRepo = (): RepoContext => ({
  owner: 'testowner',
  repo: 'testrepo',
});

// Mock Claude response with done tool
const createDoneResponse = (issuesFixed: number, issuesSkipped: number) => ({
  content: [
    {
      type: 'tool_use',
      id: 'tool_1',
      name: 'done',
      input: {
        summary: 'Completed fixing issues',
        issues_fixed: issuesFixed,
        issues_skipped: issuesSkipped,
        reason: 'All issues addressed',
      },
    },
  ],
  usage: { inputTokens: 1000, outputTokens: 500 },
  stopReason: 'tool_use',
});

// Mock Claude response with a tool use
const createToolUseResponse = (toolName: string, input: Record<string, unknown>) => ({
  content: [
    {
      type: 'tool_use',
      id: `tool_${Math.random().toString(36).slice(2)}`,
      name: toolName,
      input,
    },
  ],
  usage: { inputTokens: 1000, outputTokens: 500 },
  stopReason: 'tool_use',
});

describe('runAgentLoop', () => {
  let mockLLM: ReturnType<typeof createMockLLMClient>;
  let mockGitHub: ReturnType<typeof createMockGitHubClient>;
  let options: AgentLoopOptions;

  beforeEach(() => {
    mockLLM = createMockLLMClient();
    mockGitHub = createMockGitHubClient();

    options = {
      llm: mockLLM as unknown as AgentLoopOptions['llm'],
      github: mockGitHub as unknown as AgentLoopOptions['github'],
      repo: createMockRepo(),
      prDetails: createMockPRDetails(),
      review: createMockReview(),
      dryRun: true, // Disable label operations for most tests
    };
  });

  describe('protected branch check', () => {
    it('should reject PRs targeting main branch', async () => {
      options.prDetails = createMockPRDetails({ base: { ref: 'main', sha: 'abc' } });

      const result = await runAgentLoop(options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('protected branch');
    });

    it('should reject PRs targeting master branch', async () => {
      options.prDetails = createMockPRDetails({ base: { ref: 'master', sha: 'abc' } });

      const result = await runAgentLoop(options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('protected branch');
    });

    it('should allow PRs targeting feature branches', async () => {
      options.prDetails = createMockPRDetails({ base: { ref: 'develop', sha: 'abc' } });
      mockLLM.sendMessage.mockResolvedValueOnce(createDoneResponse(1, 0));

      const result = await runAgentLoop(options);

      expect(result.success).toBe(true);
    });
  });

  describe('successful completion', () => {
    it('should complete when done tool is called', async () => {
      mockLLM.sendMessage.mockResolvedValueOnce(createDoneResponse(1, 0));

      const result = await runAgentLoop(options);

      expect(result.success).toBe(true);
      expect(result.state.exitReason).toBe('done_tool');
      expect(result.state.fixedIssues).toBe(1);
    });

    it('should include summary in result', async () => {
      mockLLM.sendMessage.mockResolvedValueOnce(createDoneResponse(1, 0));

      const result = await runAgentLoop(options);

      expect(result.summary).toContain('GroveCoder Summary');
      expect(result.summary).toContain('1/1'); // fixed/total
    });

    it('should complete when no tool uses in response', async () => {
      mockLLM.sendMessage.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'All done!' }],
        usage: { inputTokens: 100, outputTokens: 50 },
        stopReason: 'end_turn',
      });

      const result = await runAgentLoop(options);

      expect(result.success).toBe(true);
      expect(result.state.exitReason).toBe('no_tool_use');
    });
  });

  describe('tool execution', () => {
    it('should execute tools and continue loop', async () => {
      // First response: read file
      mockLLM.sendMessage.mockResolvedValueOnce(
        createToolUseResponse('read_file', { path: 'src/index.ts' })
      );
      // Second response: done
      mockLLM.sendMessage.mockResolvedValueOnce(createDoneResponse(1, 0));

      // Mock file read
      mockGitHub.getFileContent.mockResolvedValueOnce({
        path: 'src/index.ts',
        content: 'console.log("test");',
        sha: 'abc123',
      });

      const result = await runAgentLoop(options);

      expect(result.success).toBe(true);
      expect(result.state.iteration).toBe(2);
      expect(mockLLM.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('should track consecutive failures', async () => {
      // First response: tool that will fail
      mockLLM.sendMessage.mockResolvedValueOnce(
        createToolUseResponse('read_file', { path: 'nonexistent.ts' })
      );
      // Second response: done
      mockLLM.sendMessage.mockResolvedValueOnce(createDoneResponse(0, 1));

      // Mock file read failure
      mockGitHub.getFileContent.mockRejectedValueOnce(new Error('File not found'));

      const result = await runAgentLoop(options);

      expect(result.success).toBe(true);
      // After a failed tool, consecutive failures should be 1, then reset on done tool
    });
  });

  describe('label management', () => {
    it('should add working label on start when not in dry run', async () => {
      options.dryRun = false;
      mockLLM.sendMessage.mockResolvedValueOnce(createDoneResponse(1, 0));

      await runAgentLoop(options);

      expect(mockGitHub.addLabel).toHaveBeenCalledWith(
        options.repo,
        options.prDetails.number,
        [LABELS.WORKING]
      );
    });

    it('should update labels on successful completion', async () => {
      options.dryRun = false;
      mockLLM.sendMessage.mockResolvedValueOnce(createDoneResponse(1, 0));

      await runAgentLoop(options);

      // Should remove working label
      expect(mockGitHub.removeLabel).toHaveBeenCalledWith(
        options.repo,
        options.prDetails.number,
        LABELS.WORKING
      );
      // Should add completed label
      expect(mockGitHub.addLabel).toHaveBeenCalledWith(
        options.repo,
        options.prDetails.number,
        [LABELS.COMPLETED]
      );
    });

    it('should not manage labels in dry run mode', async () => {
      options.dryRun = true;
      mockLLM.sendMessage.mockResolvedValueOnce(createDoneResponse(1, 0));

      await runAgentLoop(options);

      // addLabel should not be called (or only for non-label purposes)
      expect(mockGitHub.addLabel).not.toHaveBeenCalled();
    });
  });

  describe('iteration limits', () => {
    it('should stop at max iterations', async () => {
      // Always return a tool use to keep the loop going
      mockLLM.sendMessage.mockImplementation(() =>
        Promise.resolve(createToolUseResponse('read_file', { path: 'test.ts' }))
      );
      mockGitHub.getFileContent.mockResolvedValue({
        path: 'test.ts',
        content: 'test',
        sha: 'sha123',
      });

      const result = await runAgentLoop(options);

      expect(result.success).toBe(false);
      expect(result.state.exitReason).toBe('safety_iteration');
      expect(result.state.iteration).toBe(25);
    });
  });

  describe('error handling', () => {
    it('should handle Claude API errors gracefully', async () => {
      mockLLM.sendMessage.mockRejectedValueOnce(new Error('API Error'));

      const result = await runAgentLoop(options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('API Error');
    });
  });
});
