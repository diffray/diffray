/**
 * Executors Module - Registry and exports
 */

import type { AgentExecutor, ExecutionContext, ExecutionResult } from '../types';
import type { Executor } from './types';
import { loadConfig } from '../config';
import { cerebrasExecutor } from './api';
import { claudeCliExecutor, testCliExecutor } from './cli';

// Re-export types
export type { Executor, APIConfig, CLIConfig, StreamOptions } from './types';

// ============ Registry ============

const executors = new Map<string, Executor>([
  ['cerebras-api', cerebrasExecutor],
  ['claude-cli', claudeCliExecutor],
  ['test-cli', testCliExecutor],
]);

export function getExecutor(name: string): Executor | undefined {
  return executors.get(name);
}

export function listExecutors(): Executor[] {
  return [...executors.values()];
}

export function registerExecutor(config: AgentExecutor): void {
  const existing = executors.get(config.name);
  if (existing) {
    existing.enabled = config.enabled;
  }
}

export async function executeAgent(ctx: ExecutionContext): Promise<ExecutionResult> {
  let executor = executors.get(ctx.executor.name);

  if (!executor || !executor.enabled) {
    if (process.env.DEBUG) {
      console.warn(`Executor "${ctx.executor.name}" not available, using test-cli`);
    }
    executor = executors.get('test-cli');
  }

  if (!executor) {
    throw new Error(`No executor found: ${ctx.executor.name}`);
  }

  return executor.execute(ctx);
}

// ============ Compatibility Exports ============

export const executorFactory = {
  async autoDiscover(): Promise<void> {
    // No-op - executors are already defined
  },
  get: getExecutor,
  listExecutors(): AgentExecutor[] {
    return listExecutors().map((e) => e.getInfo());
  },
  registerExecutor,
  executeAgent,
};

// ============ High-Level Loaders ============

export async function loadExecutors(): Promise<AgentExecutor[]> {
  await executorFactory.autoDiscover();
  const allExecutors = executorFactory.listExecutors();
  const config = await loadConfig();

  const savedExecutors = config.executors || [];

  return allExecutors.map((executor) => {
    const savedExecutor = savedExecutors.find((saved) => saved.name === executor.name);
    if (savedExecutor) {
      return {
        ...executor,
        enabled: savedExecutor.enabled ?? executor.enabled,
        ...(savedExecutor.model && { model: savedExecutor.model }),
        ...(savedExecutor.temperature !== undefined && { temperature: savedExecutor.temperature }),
        ...(savedExecutor.maxTokens !== undefined && { maxTokens: savedExecutor.maxTokens }),
        ...(savedExecutor.timeout !== undefined && { timeout: savedExecutor.timeout }),
      };
    }
    return executor;
  });
}

export async function loadExcludePatterns(): Promise<string[]> {
  const config = await loadConfig();
  return config.excludePatterns;
}
