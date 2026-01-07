/**
 * Agent management - loading Agents and Executors
 */

import type { Agent, AgentExecutor } from "./types";
import { loadConfig } from "./config";
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
 * Load Agents from backend
 */
export async function loadAgentsFromBackend(): Promise<Agent[]> {
  const config = await loadConfig();

  // Check if backend is enabled
  if (!config.backend.enabled || !config.backend.url) {
    return getDefaultAgents();
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (config.backend.apiKey) {
      headers["Authorization"] = `Bearer ${config.backend.apiKey}`;
    }

    const response = await fetch(`${config.backend.url}/subagents`, {
      headers,
    });

    if (response.ok) {
      const subAgents = (await response.json()) as Agent[];
      log.success(`Loaded ${subAgents.length} Agents from backend`);
      return subAgents;
    } else {
      log.warn(`Backend returned ${response.status}, using defaults`);
    }
  } catch (error) {
    log.warn("Failed to load Agents from backend, using defaults");
  }

  return getDefaultAgents();
}

/**
 * Load Executors from backend
 */
export async function loadExecutorsFromBackend(): Promise<AgentExecutor[]> {
  const config = await loadConfig();

  // Check if backend is enabled
  if (!config.backend.enabled || !config.backend.url) {
    return getDefaultExecutors();
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (config.backend.apiKey) {
      headers["Authorization"] = `Bearer ${config.backend.apiKey}`;
    }

    const response = await fetch(`${config.backend.url}/executors`, {
      headers,
    });

    if (response.ok) {
      const executors = (await response.json()) as AgentExecutor[];
      log.success(`Loaded ${executors.length} Executors from backend`);
      return executors;
    } else {
      log.warn(`Backend returned ${response.status}, using defaults`);
    }
  } catch (error) {
    log.warn("Failed to load Executors from backend, using defaults");
  }

  return getDefaultExecutors();
}

/**
 * Save Agents to local cache
 */
export async function saveAgentsToCache(subAgents: Agent[]): Promise<void> {
  const cacheFile = `${process.env.HOME}/.diffray/subagents.json`;
  await Bun.write(cacheFile, JSON.stringify(subAgents, null, 2));
}

/**
 * Load Agents from local cache
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
 * Load Agents (from cache or backend)
 */
export async function loadAgents(): Promise<Agent[]> {
  // Try cache first
  const cached = await loadAgentsFromCache();
  if (cached) {
    return cached;
  }

  // Load from backend
  const subAgents = await loadAgentsFromBackend();

  // Save to cache
  await saveAgentsToCache(subAgents);

  return subAgents;
}

/**
 * Save Executors to local cache
 */
export async function saveExecutorsToCache(executors: AgentExecutor[]): Promise<void> {
  const cacheFile = `${process.env.HOME}/.diffray/executors.json`;
  await Bun.write(cacheFile, JSON.stringify(executors, null, 2));
}

/**
 * Load Executors from local cache
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
 * Load Executors (from cache or backend)
 */
export async function loadExecutors(): Promise<AgentExecutor[]> {
  // Try cache first
  const cached = await loadExecutorsFromCache();
  if (cached) {
    return cached;
  }

  // Load from backend
  const executors = await loadExecutorsFromBackend();

  // Save to cache
  await saveExecutorsToCache(executors);

  return executors;
}
