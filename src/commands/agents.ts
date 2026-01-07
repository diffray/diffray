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
 * Truncate string with ellipsis
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 1) + '…';
}

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

  // Calculate column widths
  const cols = {
    status: 1,
    id: Math.max(2, ...agents.map((a) => a.id.length)),
    name: Math.max(4, ...agents.map((a) => a.name.length)),
    executor: Math.max(8, ...agents.map((a) => a.executor.length)),
    description: 35,
  };

  // Header
  const header = [
    ''.padEnd(cols.status),
    'ID'.padEnd(cols.id),
    'Name'.padEnd(cols.name),
    'Executor'.padEnd(cols.executor),
    'Description'.padEnd(cols.description),
  ].join('  ');

  const separator = [
    '-'.repeat(cols.status),
    '-'.repeat(cols.id),
    '-'.repeat(cols.name),
    '-'.repeat(cols.executor),
    '-'.repeat(cols.description),
  ].join('  ');

  log.plain(header);
  log.plain(separator);

  // Rows
  for (const agent of agents) {
    const status = agent.enabled ? '●' : '○';
    const description = truncate(agent.description, cols.description);

    const row = [
      status.padEnd(cols.status),
      agent.id.padEnd(cols.id),
      agent.name.padEnd(cols.name),
      agent.executor.padEnd(cols.executor),
      description.padEnd(cols.description),
    ].join('  ');

    log.plain(row);
  }

  log.newline();
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
