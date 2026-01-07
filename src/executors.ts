import type { AgentExecutor } from './types';
import { executorFactory } from './executors/index.js';
import { loadConfig } from './config.js';

/**
 * Loads and registers all available executors.
 * @returns Promise that resolves to an array of registered AgentExecutor instances
 */
export async function loadExecutors(): Promise<AgentExecutor[]> {
  await executorFactory.autoDiscover();
  const executors = executorFactory.listExecutors();
  const config = await loadConfig();

  const savedExecutors = config.executors || [];

  return executors.map((executor) => {
    const savedExecutor = savedExecutors.find((saved) => saved.name === executor.name);
    if (savedExecutor) {
      return {
        ...executor,
        enabled: savedExecutor.enabled,
      };
    }
    return executor;
  });
}

/**
 * Loads exclude patterns from configuration.
 * @returns Promise that resolves to an array of exclude pattern strings
 */
export async function loadExcludePatterns(): Promise<string[]> {
  const config = await loadConfig();
  return config.excludePatterns;
}
