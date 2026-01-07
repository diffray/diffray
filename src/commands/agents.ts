/**
 * Agent management commands
 *
 * Agents are defined in Markdown files and cached in config.json:
 * - Agents are defined in src/defaults/agents/*.md files
 * - Sync command refreshes cache from Markdown files
 * - Agents are loaded from cache for performance
 * - Enabled/disabled via frontmatter in Markdown files
 */

import { loadAgents, syncAgentsToConfig } from '../agents.js';
import { log } from '../logger';

/**
 * List all Agents
 */
export async function listAgents(): Promise<void> {
  const agents = await loadAgents(process.cwd());

  log.robot('Available Agents');
  log.newline();

  if (agents.length === 0) {
    log.plain('No Agents configured');
    return;
  }

  for (const agent of agents) {
    log.plain(`● [${agent.id}] ${agent.name}`);
    log.plain(`   ${agent.description}`);
    log.plain(`   Executor: ${agent.executor}`);
    log.newline();
  }
}

/**
 * Show Agent details
 */
export async function showAgent(agentId: string): Promise<void> {
  const agents = await loadAgents(process.cwd());
  const agent = agents.find((a) => a.id === agentId);

  if (!agent) {
    log.error(`Agent not found: ${agentId}`);
    process.exit(1);
  }

  log.robot(`Agent: ${agent.name}`);
  log.newline();
  log.plain(`ID: ${agent.id}`);
  log.plain(`Executor: ${agent.executor}`);
  log.plain(`Description: ${agent.description}`);
  log.newline();
  log.plain('System Prompt:');
  log.separator('─');
  log.plain(agent.systemPrompt || '(no prompt)');
  log.separator('─');
}

/**
 * Sync agents from MD files to config cache
 */
export async function syncAgents(): Promise<void> {
  log.sync('Syncing agents from MD files...');

  try {
    await syncAgentsToConfig(process.cwd());
    log.success('Agents synced successfully');
  } catch (error) {
    log.error(`Failed to sync agents: ${error}`);
    process.exit(1);
  }
}
