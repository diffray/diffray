/**
 * Agent management commands
 *
 * Agents are defined in Markdown files:
 * - Agents are defined in src/defaults/agents/*.md files
 * - Agents are loaded directly from MD files on each run
 * - Enabled/disabled via frontmatter in Markdown files
 */

import { loadAgents } from '../agents.js';
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
    name: Math.max(4, ...agents.map((a) => a.name.length)),
    executor: Math.max(8, ...agents.map((a) => a.executor.length)),
    description: 35,
  };

  // Header
  const header = [
    ''.padEnd(cols.status),
    'Name'.padEnd(cols.name),
    'Executor'.padEnd(cols.executor),
    'Description'.padEnd(cols.description),
  ].join('  ');

  const separator = [
    '-'.repeat(cols.status),
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
export async function showAgent(name: string): Promise<void> {
  const agents = await loadAgents(process.cwd());
  const agent = agents.find((a) => a.name === name);

  if (!agent) {
    log.error(`Agent not found: ${name}`);
    process.exit(1);
  }

  log.robot(`Agent: ${agent.name}`);
  log.newline();
  log.plain(`Executor: ${agent.executor}`);
  log.plain(`Description: ${agent.description}`);
  log.newline();
  log.plain('System Prompt:');
  log.separator('─');
  log.plain(agent.systemPrompt || '(no prompt)');
  log.separator('─');
}

