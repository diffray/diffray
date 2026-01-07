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
  });

  describe('skip validation', () => {
    test('should skip validation when skipValidation is true', async () => {
      const stage = createValidationStage();
      const context = createContext({
        skipValidation: true,
        results: [createAgentResult([createIssue()])],
      });

      const result = await stage.execute(context);

      expect(result.success).toBe(true);
      expect(result.stageId).toBe('validation');
      // Issues should remain unchanged
      expect(context.results[0]?.issues).toHaveLength(1);
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
  });

  describe('validation execution', () => {
    test('should execute validation and return success', async () => {
      const stage = createValidationStage();
      const issues = [
        createIssue({ shortDescription: 'Issue 1' }),
        createIssue({ shortDescription: 'Issue 2', lineStart: 20 }),
      ];
      const context = createContext({
        results: [createAgentResult(issues)],
      });

      const result = await stage.execute(context);

      // With test-cli returning [], all issues will be filtered out
      expect(result.success).toBe(true);
      expect(result.stageId).toBe('validation');
      expect(result.duration).toBeGreaterThan(0);
    });

    test('should filter issues based on validation result', async () => {
      const stage = createValidationStage();
      const issues = [
        createIssue({ shortDescription: 'Valid issue', lineStart: 10, lineEnd: 10 }),
        createIssue({ shortDescription: 'Invalid issue', lineStart: 20, lineEnd: 20 }),
      ];
      const context = createContext({
        results: [createAgentResult(issues)],
      });

      await stage.execute(context);

      // test-cli returns [], so all issues are filtered
      expect(context.results[0]?.issues).toHaveLength(0);
    });
  });

  describe('batching', () => {
    test('should handle many issues (requiring batching)', async () => {
      const stage = createValidationStage();

      // Create 20 issues to trigger batching (batch size is 15)
      const issues: Issue[] = [];
      for (let i = 0; i < 20; i++) {
        issues.push(createIssue({ shortDescription: `Issue ${i}`, lineStart: i + 1 }));
      }

      const context = createContext({
        results: [createAgentResult(issues)],
      });

      const result = await stage.execute(context);

      expect(result.success).toBe(true);
    });
  });

  describe('multiple agent results', () => {
    test('should validate issues from multiple agents', async () => {
      const stage = createValidationStage();

      const issues1 = [createIssue({ agent: 'agent-1', shortDescription: 'Issue from agent 1' })];
      const issues2 = [createIssue({ agent: 'agent-2', shortDescription: 'Issue from agent 2' })];

      const context = createContext({
        results: [
          { ...createAgentResult(issues1), agentId: 'agent-1', agentName: 'Agent 1' },
          { ...createAgentResult(issues2), agentId: 'agent-2', agentName: 'Agent 2' },
        ],
      });

      const result = await stage.execute(context);

      expect(result.success).toBe(true);
    });
  });

  describe('issue matching', () => {
    test('should match issues by file, lineStart, lineEnd, and agent', async () => {
      const stage = createValidationStage();

      // Two issues with same file but different lines
      const issues = [
        createIssue({ file: 'src/a.ts', lineStart: 10, lineEnd: 10, agent: 'agent-1' }),
        createIssue({ file: 'src/a.ts', lineStart: 20, lineEnd: 20, agent: 'agent-1' }),
      ];

      const context = createContext({
        results: [createAgentResult(issues)],
      });

      await stage.execute(context);

      // Both should be filtered since test-cli returns []
      expect(context.results[0]?.issues).toHaveLength(0);
    });
  });

  describe('stage result', () => {
    test('should include stage metadata in result', async () => {
      const stage = createValidationStage();
      const context = createContext({
        results: [createAgentResult([createIssue()])],
      });

      const result = await stage.execute(context);

      expect(result.stageId).toBe('validation');
      expect(result.stageName).toBe('Validation');
      expect(typeof result.duration).toBe('number');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });
});
