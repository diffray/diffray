/**
 * SubAgent management commands
 */

import { loadSubAgents, saveSubAgentsToCache, loadSubAgentsFromBackend } from "../agents";
import type { SubAgent } from "../types";
import { log } from "../logger";

/**
 * List all SubAgents
 */
export async function listAgents(): Promise<void> {
  const subAgents = await loadSubAgents();

  log.robot("Available SubAgents");
  log.newline();

  if (subAgents.length === 0) {
    log.plain("No SubAgents configured");
    return;
  }

  for (const subAgent of subAgents) {
    const status = subAgent.enabled ? "✅" : "❌";
    log.plain(`${status} [${subAgent.id}] ${subAgent.name}`);
    log.plain(`   ${subAgent.description}`);
    log.plain(`   Executor: ${subAgent.executorId}`);
    log.plain(`   Order: ${subAgent.order}`);
    log.newline();
  }
}

/**
 * Show SubAgent details
 */
export async function showAgent(subAgentId: string): Promise<void> {
  const subAgents = await loadSubAgents();
  const subAgent = subAgents.find((a) => a.id === subAgentId);

  if (!subAgent) {
    log.error(`SubAgent not found: ${subAgentId}`);
    process.exit(1);
  }

  log.robot(`SubAgent: ${subAgent.name}`);
  log.newline();
  log.plain(`ID: ${subAgent.id}`);
  log.plain(`Executor: ${subAgent.executorId}`);
  log.plain(`Description: ${subAgent.description}`);
  log.plain(`Enabled: ${subAgent.enabled ? "Yes" : "No"}`);
  log.plain(`Order: ${subAgent.order}`);
  log.newline();
  log.plain("System Prompt:");
  log.separator("─");
  log.plain(subAgent.systemPrompt || "(no prompt)");
  log.separator("─");
}

/**
 * Enable SubAgent
 */
export async function enableAgent(subAgentId: string): Promise<void> {
  const subAgents = await loadSubAgents();
  const subAgent = subAgents.find((a) => a.id === subAgentId);

  if (!subAgent) {
    log.error(`SubAgent not found: ${subAgentId}`);
    process.exit(1);
  }

  subAgent.enabled = true;
  await saveSubAgentsToCache(subAgents);
  log.success(`Enabled SubAgent: ${subAgent.name}`);
}

/**
 * Disable SubAgent
 */
export async function disableAgent(subAgentId: string): Promise<void> {
  const subAgents = await loadSubAgents();
  const subAgent = subAgents.find((a) => a.id === subAgentId);

  if (!subAgent) {
    log.error(`SubAgent not found: ${subAgentId}`);
    process.exit(1);
  }

  subAgent.enabled = false;
  await saveSubAgentsToCache(subAgents);
  log.success(`Disabled SubAgent: ${subAgent.name}`);
}

/**
 * Sync SubAgents from backend
 */
export async function syncAgents(): Promise<void> {
  log.sync("Syncing SubAgents from backend...");

  try {
    const subAgents = await loadSubAgentsFromBackend();
    await saveSubAgentsToCache(subAgents);
    log.success(`Synced ${subAgents.length} SubAgent(s)`);
  } catch (error) {
    log.error(`Failed to sync SubAgents: ${error}`);
    process.exit(1);
  }
}

/**
 * Set SubAgent order
 */
export async function setAgentOrder(subAgentId: string, order: number): Promise<void> {
  const subAgents = await loadSubAgents();
  const subAgent = subAgents.find((a) => a.id === subAgentId);

  if (!subAgent) {
    log.error(`SubAgent not found: ${subAgentId}`);
    process.exit(1);
  }

  subAgent.order = order;
  await saveSubAgentsToCache(subAgents);
  log.success(`Set order for ${subAgent.name} to ${order}`);
}

