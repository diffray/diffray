/**
 * Executor management commands
 */

import { loadExecutors, saveExecutorsToCache, loadExecutorsFromBackend } from "../agents";
import type { AgentExecutor } from "../types";
import { log } from "../logger";

/**
 * List all Executors
 */
export async function listExecutors(): Promise<void> {
  const executors = await loadExecutors();

  log.robot("Available Executors");
  log.newline();

  if (executors.length === 0) {
    log.plain("No Executors configured");
    return;
  }

  for (const executor of executors) {
    const status = executor.enabled ? "✅" : "❌";
    log.plain(`${status} [${executor.id}] ${executor.name}`);
    log.plain(`   ${executor.description}`);
    log.plain(`   Type: ${executor.type}`);
    
    if (executor.type === "cli") {
      log.plain(`   Command: ${executor.command} ${executor.args?.join(" ") || ""}`);
      log.plain(`   Timeout: ${executor.timeout || 60}s`);
    } else if (executor.type === "llm-api") {
      log.plain(`   Provider: ${executor.provider}`);
      log.plain(`   Model: ${executor.model}`);
    }
    
    log.newline();
  }
}

/**
 * Show Executor details
 */
export async function showExecutor(executorId: string): Promise<void> {
  const executors = await loadExecutors();
  const executor = executors.find((e) => e.id === executorId);

  if (!executor) {
    log.error(`Executor not found: ${executorId}`);
    process.exit(1);
  }

  log.robot(`Executor: ${executor.name}`);
  log.newline();
  log.plain(`ID: ${executor.id}`);
  log.plain(`Type: ${executor.type}`);
  log.plain(`Description: ${executor.description}`);
  log.plain(`Enabled: ${executor.enabled ? "Yes" : "No"}`);
  
  if (executor.type === "cli") {
    log.plain(`Command: ${executor.command}`);
    log.plain(`Args: ${executor.args?.join(" ") || "(none)"}`);
    log.plain(`Timeout: ${executor.timeout || 60}s`);
  } else if (executor.type === "llm-api") {
    log.plain(`Provider: ${executor.provider}`);
    log.plain(`Model: ${executor.model}`);
    log.plain(`Temperature: ${executor.temperature || 0.7}`);
    log.plain(`Max Tokens: ${executor.maxTokens || 4096}`);
  }
  
  if (executor.env) {
    log.newline();
    log.plain("Environment Variables:");
    for (const [key, value] of Object.entries(executor.env)) {
      const maskedValue = key.includes("KEY") || key.includes("TOKEN") 
        ? value.substring(0, 8) + "..." 
        : value;
      log.plain(`  ${key}: ${maskedValue}`);
    }
  }
}

/**
 * Enable Executor
 */
export async function enableExecutor(executorId: string): Promise<void> {
  const executors = await loadExecutors();
  const executor = executors.find((e) => e.id === executorId);

  if (!executor) {
    log.error(`Executor not found: ${executorId}`);
    process.exit(1);
  }

  executor.enabled = true;
  await saveExecutorsToCache(executors);
  log.success(`Enabled Executor: ${executor.name}`);
}

/**
 * Disable Executor
 */
export async function disableExecutor(executorId: string): Promise<void> {
  const executors = await loadExecutors();
  const executor = executors.find((e) => e.id === executorId);

  if (!executor) {
    log.error(`Executor not found: ${executorId}`);
    process.exit(1);
  }

  executor.enabled = false;
  await saveExecutorsToCache(executors);
  log.success(`Disabled Executor: ${executor.name}`);
}

/**
 * Sync Executors from backend
 */
export async function syncExecutors(): Promise<void> {
  log.sync("Syncing Executors from backend...");

  try {
    const executors = await loadExecutorsFromBackend();
    await saveExecutorsToCache(executors);
    log.success(`Synced ${executors.length} Executor(s)`);
  } catch (error) {
    log.error(`Failed to sync Executors: ${error}`);
    process.exit(1);
  }
}

