/**
 * Executors Module - Registry and exports
 */

import type { AgentExecutor, ExecutionContext, ExecutionResult } from '../types';
import type { Executor } from './types';
import { loadConfig } from '../config';
import { cerebrasExecutor } from './api';
import {
  claudeCliExecutor,
  testCliExecutor,
  cursorAgentCliExecutor,
  opencodeCliExecutor,
} from './cli';

// Re-export types
export type { Executor, APIConfig, CLIConfig, StreamOptions } from './types';

// ============ Registry ============

const executors = new Map<string, Executor>([
  ['cerebras-api', cerebrasExecutor],
  ['claude-cli', claudeCliExecutor],
  ['cursor-agent-cli', cursorAgentCliExecutor],
  ['opencode-cli', opencodeCliExecutor],
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

  // Apply model override if provided
  if (ctx.modelOverride && executor.applySettings) {
    const overriddenExecutor = executor.applySettings({ model: ctx.modelOverride });
    return executor.execute({
      ...ctx,
      executor: overriddenExecutor,
    });
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
  return executorFactory.listExecutors();
}

export async function loadExcludePatterns(projectPath?: string): Promise<string[]> {
  const config = await loadConfig(projectPath ?? process.cwd());
  return config.excludePatterns;
}
