import { test, expect, describe } from 'vitest';
import {
  getExecutor,
  listExecutors,
  registerExecutor,
  executeAgent,
  executorFactory,
} from './executors';
import type {
  ExecutionContext,
  Agent,
  AgentExecutor,
  LLMAPIAgentExecutor,
  CLIAgentExecutor,
} from './types';

describe('Executors', () => {
  describe('getExecutor', () => {
    test('should return cerebras-api executor', () => {
      const executor = getExecutor('cerebras-api');

      expect(executor).toBeDefined();
      expect(executor?.name).toBe('cerebras-api');
      expect(executor?.type).toBe('llm-api');
    });

    test('should return claude-cli executor', () => {
      const executor = getExecutor('claude-cli');

      expect(executor).toBeDefined();
      expect(executor?.name).toBe('claude-cli');
      expect(executor?.type).toBe('cli');
    });

    test('should return codex-cli executor', () => {
      const executor = getExecutor('codex-cli');

      expect(executor).toBeDefined();
      expect(executor?.name).toBe('codex-cli');
      expect(executor?.type).toBe('cli');
    });

    test('should return test-cli executor', () => {
      const executor = getExecutor('test-cli');

      expect(executor).toBeDefined();
      expect(executor?.name).toBe('test-cli');
      expect(executor?.type).toBe('cli');
      expect(executor?.enabled).toBe(true);
    });

    test('should return undefined for unknown executor', () => {
      const executor = getExecutor('unknown-executor');
      expect(executor).toBeUndefined();
    });
  });

  describe('listExecutors', () => {
    test('should return all registered executors', () => {
      const executors = listExecutors();

      expect(executors.length).toBeGreaterThanOrEqual(3);

      const names = executors.map((e) => e.name);
      expect(names).toContain('cerebras-api');
      expect(names).toContain('claude-cli');
      expect(names).toContain('codex-cli');
      expect(names).toContain('test-cli');
    });

    test('each executor should have required properties', () => {
      const executors = listExecutors();

      for (const executor of executors) {
        expect(executor.name).toBeDefined();
        expect(executor.description).toBeDefined();
        expect(executor.type).toMatch(/^(llm-api|cli)$/);
        expect(typeof executor.enabled).toBe('boolean');
        expect(typeof executor.execute).toBe('function');
        expect(typeof executor.getInfo).toBe('function');
      }
    });
  });

  describe('registerExecutor', () => {
    test('should update enabled state of existing executor', () => {
      const executor = getExecutor('test-cli');
      const originalEnabled = executor?.enabled;

      registerExecutor({
        name: 'test-cli',
        description: 'Test',
        type: 'cli',
        enabled: false,
      });

      const updated = getExecutor('test-cli');
      expect(updated?.enabled).toBe(false);

      // Restore original state
      registerExecutor({
        name: 'test-cli',
        description: 'Test',
        type: 'cli',
        enabled: originalEnabled ?? true,
      });
    });
  });

  describe('executorFactory', () => {
    test('should have autoDiscover method', async () => {
      await expect(executorFactory.autoDiscover()).resolves.toBeUndefined();
    });

    test('should have get method', () => {
      const executor = executorFactory.get('test-cli');
      expect(executor).toBeDefined();
    });

    test('should have listExecutors method returning AgentExecutor[]', () => {
      const executors = executorFactory.listExecutors();

      expect(Array.isArray(executors)).toBe(true);
      for (const executor of executors) {
        expect(executor.name).toBeDefined();
        expect(executor.type).toBeDefined();
      }
    });
  });

  describe('executor.getInfo', () => {
    test('cerebras-api should return correct info', () => {
      const executor = getExecutor('cerebras-api');
      const info = executor?.getInfo() as LLMAPIAgentExecutor;

      expect(info?.name).toBe('cerebras-api');
      expect(info?.type).toBe('llm-api');
      expect(info?.model).toBe('llama-3.3-70b');
      expect(info?.baseUrl).toBe('https://api.cerebras.ai/v1');
    });

    test('claude-cli should return correct info', () => {
      const executor = getExecutor('claude-cli');
      const info = executor?.getInfo() as CLIAgentExecutor;

      expect(info?.name).toBe('claude-cli');
      expect(info?.type).toBe('cli');
      expect(info?.model).toBe('opus');
      expect(info?.timeout).toBe(120);
    });

    test('test-cli should return correct info', () => {
      const executor = getExecutor('test-cli');
      const info = executor?.getInfo() as CLIAgentExecutor;

      expect(info?.name).toBe('test-cli');
      expect(info?.type).toBe('cli');
      expect(info?.timeout).toBe(10);
    });
  });

  describe('executeAgent with test-cli', () => {
    const createTestContext = (): ExecutionContext => {
      const agent: Agent = {
        name: 'test-agent',
        description: 'Test agent',
        systemPrompt: 'You are a test agent',
        enabled: true,
        order: 1,
        executor: 'test-cli',
      };

      const executor: AgentExecutor = {
        name: 'test-cli',
        description: 'Test executor',
        type: 'cli',
        enabled: true,
      };

      return {
        agent,
        executor,
        input: 'Test input',
        systemPrompt: 'Test system prompt',
        verbose: false,
        quiet: true,
      };
    };

    test('should execute test-cli and return empty array', async () => {
      const ctx = createTestContext();
      const result = await executeAgent(ctx);

      expect(result.success).toBe(true);
      expect(result.agent).toBe('test-agent');
      expect(result.executor).toBe('test-cli');
      expect(result.output.trim()).toBe('[]');
      expect(result.duration).toBeGreaterThan(0);
    });

    test('should fallback to test-cli for unknown executor', async () => {
      const ctx = createTestContext();
      ctx.executor.name = 'nonexistent-executor';

      const result = await executeAgent(ctx);

      expect(result.success).toBe(true);
      expect(result.output.trim()).toBe('[]');
    });

    test('should include prompt in result', async () => {
      const ctx = createTestContext();
      const result = await executeAgent(ctx);

      expect(result.prompt).toBeDefined();
      expect(result.prompt).toContain('Test input');
    });
  });

  describe('executor enabled state', () => {
    test('cerebras-api should be disabled without API key', () => {
      // CEREBRAS_API_KEY is not set in test environment
      const executor = getExecutor('cerebras-api');

      // Enabled state depends on CEREBRAS_API_KEY
      if (!process.env.CEREBRAS_API_KEY) {
        expect(executor?.enabled).toBe(false);
      }
    });

    test('claude-cli should be enabled by default', () => {
      const executor = getExecutor('claude-cli');
      expect(executor?.enabled).toBe(true);
    });

    test('test-cli should always be enabled', () => {
      const executor = getExecutor('test-cli');
      expect(executor?.enabled).toBe(true);
    });
  });
});
