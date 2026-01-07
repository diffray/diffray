/**
 * Agent management - loading Agents and Executors
 */

import type { Agent, AgentExecutor } from "./types";
import { loadConfig, getAgents, getExecutors, updateConfig } from "./config";
import { log } from "./logger";
import { getDefaultAgents } from "./agents/defaults";
import { executorFactory } from "./executors/factory";

/**
 * Get default executors via auto-discovery
 */
async function getDefaultExecutors(): Promise<AgentExecutor[]> {
  await executorFactory.autoDiscover();
  return executorFactory.listExecutors();
}

/**
 * Load unified config from backend
 */
async function loadConfigFromBackend() {
  const config = await loadConfig();

  // Check if backend is enabled
  if (!config.backend.enabled || !config.backend.url) {
    return null;
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (config.backend.apiKey) {
      headers["Authorization"] = `Bearer ${config.backend.apiKey}`;
    }

    const response = await fetch(`${config.backend.url}/config`, {
      headers,
    });

    if (response.ok) {
      const backendConfig = await response.json();
      log.success(`Loaded config from backend`);
      return backendConfig;
    } else {
      log.warn(`Backend returned ${response.status}, using local config`);
    }
  } catch (error) {
    log.warn("Failed to load config from backend, using local config");
  }

  return null;
}

/**
 * Load Agents from backend
 */
export async function loadAgentsFromBackend(): Promise<Agent[]> {
  const backendConfig = await loadConfigFromBackend();

  if (backendConfig && backendConfig.agents) {
    log.success(`Loaded ${backendConfig.agents.length} Agents from backend`);
    return backendConfig.agents;
  }

  return getDefaultAgents();
}

/**
 * Load Executors from backend
 */
export async function loadExecutorsFromBackend(): Promise<AgentExecutor[]> {
  const backendConfig = await loadConfigFromBackend();

  if (backendConfig && backendConfig.executors) {
    log.success(`Loaded ${backendConfig.executors.length} Executors from backend`);
    return backendConfig.executors;
  }

  return getDefaultExecutors();
}

/**
 * Save Agents to unified config
 */
export async function saveAgentsToCache(agents: Agent[]): Promise<void> {
  await updateConfig({ agents });
}

/**
 * @deprecated Use loadAgents() instead - now reads from unified config
 */
export async function loadAgentsFromCache(): Promise<Agent[] | null> {
  try {
    const cacheFile = Bun.file(`${process.env.HOME}/.diffray/subagents.json`);
    if (await cacheFile.exists()) {
      return await cacheFile.json();
    }
  } catch (error) {
    log.warn("Failed to load Agents from cache");
  }
  return null;
}

/**
 * Load Agents from unified config
 */
export async function loadAgents(): Promise<Agent[]> {
  const config = await loadConfig();
  
  // If no agents in config, try loading from backend and save to config
  if (config.agents.length === 0) {
    const agents = await loadAgentsFromBackend();
    if (agents.length > 0) {
      await updateConfig({ agents });
    }
    return agents;
  }
  
  return getAgents(config);
}

/**
 * Save Executors to unified config
 */
export async function saveExecutorsToCache(executors: AgentExecutor[]): Promise<void> {
  await updateConfig({ executors });
}

/**
 * @deprecated Use loadExecutors() instead - now reads from unified config
 */
export async function loadExecutorsFromCache(): Promise<AgentExecutor[] | null> {
  try {
    const cacheFile = Bun.file(`${process.env.HOME}/.diffray/executors.json`);
    if (await cacheFile.exists()) {
      return await cacheFile.json();
    }
  } catch (error) {
    log.warn("Failed to load Executors from cache");
  }
  return null;
}

/**
 * Load Executors from unified config
 */
export async function loadExecutors(): Promise<AgentExecutor[]> {
  const config = await loadConfig();
  
  // If no executors in config, use defaults from factory
  if (config.executors.length === 0) {
    const executors = await getDefaultExecutors();
    if (executors.length > 0) {
      await updateConfig({ executors });
    }
    return executors;
  }
  
  return getExecutors(config);
}