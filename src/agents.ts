import type { Agent } from './types';
import { loadAgentsFromDirectory } from './agents/md-loader.js';
import { loadWithPriority, loadWithPriorityAndExtends } from './md-loader.js';
import { loadConfig } from './config.js';

/**
 * Options for loading agents
 */
export interface LoadAgentsOptions {
  projectPath?: string;
  executorOverride?: string;
}

/**
 * Load agents from all sources with priority merge
 *
 * Loads agents from all sources (defaults, user, project) with priority merge.
 * This function always loads from MD files without caching.
 * Applies executor settings from config.executors[currentExecutor][stage].
 *
 * @param options - Load options (projectPath, executorOverride)
 * @returns Merged agents array from MD sources
 */
export async function loadAgents(options?: LoadAgentsOptions | string): Promise<Agent[]> {
  // Support legacy signature: loadAgents(projectPath?: string)
  const opts: LoadAgentsOptions =
    typeof options === 'string' ? { projectPath: options } : options || {};

  const resolvedProjectPath = opts.projectPath || process.cwd();

  // Load config first to check for extends
  const config = await loadConfig(resolvedProjectPath);

  // Use extends-aware loader if extends are configured
  const agents =
    config.extends.length > 0
      ? await loadWithPriorityAndExtends<Agent>(
          'agents',
          loadAgentsFromDirectory,
          resolvedProjectPath,
          config.extends
        )
      : await loadWithPriority<Agent>('agents', loadAgentsFromDirectory, resolvedProjectPath);
  // Use executor override if provided, otherwise use config.executor
  const currentExecutor = opts.executorOverride || config.executor;
  const executorConfig = config.executors[currentExecutor] || {};

  return agents
    .map((agent) => {
      const stage = agent.stage || 'review';
      const stageSettings = executorConfig[stage as 'review' | 'validation'] || {};

      // Apply config.agents override if present
      const agentOverride = config.agents[agent.name] || {};

      // Apply settings: executorConfig[stage] merged with agent.executorSettings, then override
      return {
        ...agent,
        executor: agent.executor || currentExecutor,
        executorSettings: {
          ...stageSettings,
          ...agent.executorSettings,
          // Apply model/timeout from override
          ...(agentOverride.model && { model: agentOverride.model }),
          ...(agentOverride.timeout && { timeout: agentOverride.timeout }),
        },
        // Apply enabled override (defaults to agent.enabled if not specified)
        enabled: agentOverride.enabled ?? agent.enabled,
      };
    })
    .filter((agent) => agent.enabled !== false);
}
