/**
 * Agent management - loading SubAgents and Executors
 */

import type { SubAgent, AgentExecutor } from "./types";
import { loadConfig } from "./config";
import { log } from "./logger";
import { getDefaultSubAgents } from "./subagents/defaults";
import { getDefaultExecutors } from "./executors/defaults";

/**
 * Load SubAgents from backend
 */
export async function loadSubAgentsFromBackend(): Promise<SubAgent[]> {
  const config = await loadConfig();

  // Check if backend is enabled
  if (!config.backend.enabled || !config.backend.url) {
    return getDefaultSubAgents();
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
      const subAgents = (await response.json()) as SubAgent[];
      log.success(`Loaded ${subAgents.length} SubAgents from backend`);
      return subAgents;
    } else {
      log.warn(`Backend returned ${response.status}, using defaults`);
    }
  } catch (error) {
    log.warn("Failed to load SubAgents from backend, using defaults");
  }

  return getDefaultSubAgents();
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
 * Save SubAgents to local cache
 */
export async function saveSubAgentsToCache(subAgents: SubAgent[]): Promise<void> {
  const cacheFile = `${process.env.HOME}/.diffray/subagents.json`;
  await Bun.write(cacheFile, JSON.stringify(subAgents, null, 2));
}

/**
 * Load SubAgents from local cache
 */
export async function loadSubAgentsFromCache(): Promise<SubAgent[] | null> {
  try {
    const cacheFile = Bun.file(`${process.env.HOME}/.diffray/subagents.json`);
    if (await cacheFile.exists()) {
      return await cacheFile.json();
    }
  } catch (error) {
    log.warn("Failed to load SubAgents from cache");
  }
  return null;
}

/**
 * Load SubAgents (from cache or backend)
 */
export async function loadSubAgents(): Promise<SubAgent[]> {
  // Try cache first
  const cached = await loadSubAgentsFromCache();
  if (cached) {
    return cached;
  }

  // Load from backend
  const subAgents = await loadSubAgentsFromBackend();

  // Save to cache
  await saveSubAgentsToCache(subAgents);

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
