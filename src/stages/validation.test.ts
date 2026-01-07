import { test, expect, describe } from 'bun:test';
import { createValidationStage } from './validation';
import type { PipelineContext, Issue, AgentResult } from '../types';

describe('Validation Stage', () => {
  const createIssue = (overrides: Partial<Issue> = {}): Issue => ({
    file: 'src/app.ts',
    lineStart: 10,
    lineEnd: 15,
    severity: 'high',
    category: 'bug',
    shortDescription: 'Test issue',
    fullDescription: 'Full description',
    suggestion: 'Fix it',
    agent: 'test-agent',
    ...overrides,
  });

  const createAgentResult = (issues: Issue[]): AgentResult => ({
    agentId: 'test-agent',
    agentName: 'Test Agent',
    executor: 'test-cli',
    executorName: 'Test CLI',
    success: true,
    output: JSON.stringify(issues),
    duration: 100,
    issues,
  });

  const createContext = (overrides: Partial<PipelineContext> = {}): PipelineContext => ({
    diffs: [],
    issues: [],
    results: [],
    matchedRules: [],
    metadata: {
      timestamp: Date.now(),
      repository: 'test-repo',
    },
    concurrency: 1,
    verbose: false,
    quiet: true,
    skipValidation: false,
    ...overrides,
  });

  describe('createValidationStage', () => {
    test('should create stage with correct properties', () => {
      const stage = createValidationStage();

      expect(stage.id).toBe('validation');
      expect(stage.name).toBe('Validation');
      expect(stage.enabled).toBe(true);
      expect(stage.order).toBe(5);
      expect(typeof stage.execute).toBe('function');
    });

    test('should have correct description', () => {
      const stage = createValidationStage();
      expect(stage.description).toBe('Validate issues and filter out false positives');
    });
  });

  describe('skip validation', () => {
    test('should skip validation when skipValidation is true', async () => {
      const stage = createValidationStage();
      const issues = [createIssue()];
      const context = createContext({
        skipValidation: true,
        results: [createAgentResult(issues)],
      });

      const result = await stage.execute(context);

      expect(result.success).toBe(true);
      expect(result.stageId).toBe('validation');
      // Issues should remain unchanged when skipped
      expect(context.results[0]?.issues).toHaveLength(1);
      expect(context.results[0]?.issues[0]?.shortDescription).toBe('Test issue');
    });

    test('should return early with minimal duration when skipped', async () => {
      const stage = createValidationStage();
      const context = createContext({
        skipValidation: true,
        results: [createAgentResult([createIssue()])],
      });

      const result = await stage.execute(context);

      expect(result.duration).toBeLessThan(100); // Should be very fast
    });
  });

  describe('no issues to validate', () => {
    test('should succeed with no issues', async () => {
      const stage = createValidationStage();
      const context = createContext({
        results: [createAgentResult([])],
      });

      const result = await stage.execute(context);

      expect(result.success).toBe(true);
      expect(result.stageId).toBe('validation');
    });

    test('should succeed with empty results', async () => {
      const stage = createValidationStage();
      const context = createContext({
        results: [],
      });

      const result = await stage.execute(context);

      expect(result.success).toBe(true);
    });

    test('should succeed with results but all empty issues', async () => {
      const stage = createValidationStage();
      const context = createContext({
        results: [
          createAgentResult([]),
          createAgentResult([]),
          createAgentResult([]),
        ],
      });

      const result = await stage.execute(context);

      expect(result.success).toBe(true);
    });
  });

  describe('stage result structure', () => {
    test('should return correct stageId and stageName', async () => {
      const stage = createValidationStage();
      const context = createContext({ skipValidation: true });

      const result = await stage.execute(context);

      expect(result.stageId).toBe('validation');
      expect(result.stageName).toBe('Validation');
    });

    test('should include duration', async () => {
      const stage = createValidationStage();
      const context = createContext({ skipValidation: true });

      const result = await stage.execute(context);

      expect(typeof result.duration).toBe('number');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('context mutation', () => {
    test('should not mutate context when skipping validation', async () => {
      const stage = createValidationStage();
      const originalIssue = createIssue({ shortDescription: 'Original' });
      const context = createContext({
        skipValidation: true,
        results: [createAgentResult([originalIssue])],
      });

      await stage.execute(context);

      expect(context.results[0]?.issues[0]?.shortDescription).toBe('Original');
    });

    test('should not mutate context when no issues to validate', async () => {
      const stage = createValidationStage();
      const context = createContext({
        results: [createAgentResult([])],
      });
      const originalResultsLength = context.results.length;

      await stage.execute(context);

      expect(context.results.length).toBe(originalResultsLength);
    });
  });

  describe('multiple agent results', () => {
    test('should collect issues from all results when no issues present', async () => {
      const stage = createValidationStage();
      const context = createContext({
        results: [
          { ...createAgentResult([]), agentId: 'agent-1' },
          { ...createAgentResult([]), agentId: 'agent-2' },
          { ...createAgentResult([]), agentId: 'agent-3' },
        ],
      });

      const result = await stage.execute(context);

      expect(result.success).toBe(true);
      expect(context.results).toHaveLength(3);
    });

    test('should preserve all results when skipping validation', async () => {
      const stage = createValidationStage();
      const context = createContext({
        skipValidation: true,
        results: [
          { ...createAgentResult([createIssue({ agent: 'a1' })]), agentId: 'agent-1' },
          { ...createAgentResult([createIssue({ agent: 'a2' })]), agentId: 'agent-2' },
        ],
      });

      await stage.execute(context);

      expect(context.results[0]?.issues).toHaveLength(1);
      expect(context.results[1]?.issues).toHaveLength(1);
    });
  });
});
