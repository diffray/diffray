import type { Agent } from './types';
import { loadAgentsFromDirectory } from './agents/md-loader.js';
import { loadWithPriority } from './md-loader.js';
import { loadConfig, updateConfig, getAgents } from './config.js';
import { log } from './logger.js';

/**
 * Load agents from all sources with priority merge and cache them in config
 *
 * Caching strategy:
 * - Agents are cached in the global config file
 * - When cache is empty or undefined, agents are synced from MD files
 * - Subsequent calls return cached agents for performance
 * - Cache can be refreshed by calling syncAgentsToConfig()
 *
 * @param projectPath - Path to project root (defaults to process.cwd())
 * @returns Merged agents array from cache or MD sources
 */
export async function loadAgents(projectPath?: string): Promise<Agent[]> {
  const config = await loadConfig();

  // If cache is empty, sync from MD sources
  if (!config.agents || config.agents.length === 0) {
    await syncAgentsToConfig(projectPath);
    const updatedConfig = await loadConfig();
    return getAgents(updatedConfig);
  }

  return getAgents(config);
}

/**
 * Sync agents from MD sources to config cache
 *
 * Loads agents from all sources (defaults, user, project) with priority merge
 * and saves them to the config cache for fast subsequent access.
 *
 * @param projectPath - Path to project root (defaults to process.cwd())
 */
export async function syncAgentsToConfig(projectPath?: string): Promise<void> {
  const resolvedProjectPath = projectPath || process.cwd();

  // Load from all sources with priority merge
  const mergedAgents = await loadWithPriority<Agent>(
    'agents',
    loadAgentsFromDirectory,
    resolvedProjectPath
  );

  // Save to config cache
  await updateConfig({ agents: mergedAgents });

  log.info(`Synced ${mergedAgents.length} agents to config cache`);
}
