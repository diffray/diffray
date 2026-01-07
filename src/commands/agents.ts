/**
 * Agent management commands
 */

import { loadAgents, saveAgentsToCache, loadAgentsFromBackend } from "../agents";
import type { Agent } from "../types";
import { log } from "../logger";

/**
 * List all Agents
 */
export async function listAgents(): Promise<void> {
  const subAgents = await loadAgents();

  log.robot("Available Agents");
  log.newline();

  if (subAgents.length === 0) {
    log.plain("No Agents configured");
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
 * Show Agent details
 */
export async function showAgent(subAgentId: string): Promise<void> {
  const subAgents = await loadAgents();
  const subAgent = subAgents.find((a) => a.id === subAgentId);

  if (!subAgent) {
    log.error(`Agent not found: ${subAgentId}`);
    process.exit(1);
  }

  log.robot(`Agent: ${subAgent.name}`);
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
 * Enable Agent
 */
export async function enableAgent(subAgentId: string): Promise<void> {
  const subAgents = await loadAgents();
  const subAgent = subAgents.find((a) => a.id === subAgentId);

  if (!subAgent) {
    log.error(`Agent not found: ${subAgentId}`);
    process.exit(1);
  }

  subAgent.enabled = true;
  await saveAgentsToCache(subAgents);
  log.success(`Enabled Agent: ${subAgent.name}`);
}

/**
 * Disable Agent
 */
export async function disableAgent(subAgentId: string): Promise<void> {
  const subAgents = await loadAgents();
  const subAgent = subAgents.find((a) => a.id === subAgentId);

  if (!subAgent) {
    log.error(`Agent not found: ${subAgentId}`);
    process.exit(1);
  }

  subAgent.enabled = false;
  await saveAgentsToCache(subAgents);
  log.success(`Disabled Agent: ${subAgent.name}`);
}

/**
 * Sync Agents from backend
 */
export async function syncAgents(): Promise<void> {
  log.sync("Syncing Agents from backend...");

  try {
    const subAgents = await loadAgentsFromBackend();
    await saveAgentsToCache(subAgents);
    log.success(`Synced ${subAgents.length} Agent(s)`);
  } catch (error) {
    log.error(`Failed to sync Agents: ${error}`);
    process.exit(1);
  }
}

/**
 * Set Agent order
 */
export async function setAgentOrder(subAgentId: string, order: number): Promise<void> {
  const subAgents = await loadAgents();
  const subAgent = subAgents.find((a) => a.id === subAgentId);

  if (!subAgent) {
    log.error(`Agent not found: ${subAgentId}`);
    process.exit(1);
  }

  subAgent.order = order;
  await saveAgentsToCache(subAgents);
  log.success(`Set order for ${subAgent.name} to ${order}`);
}

