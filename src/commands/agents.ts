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
 * Format executorSettings as compact string
 */
function formatSettings(settings?: Record<string, unknown>): string {
  if (!settings || Object.keys(settings).length === 0) return '-';
  return Object.entries(settings)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
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
  const settingsStrs = agents.map((a) => formatSettings(a.executorSettings));
  const cols = {
    status: 1,
    name: Math.max(4, ...agents.map((a) => a.name.length)),
    executor: Math.max(8, ...agents.map((a) => a.executor.length)),
    settings: Math.max(8, ...settingsStrs.map((s) => Math.min(s.length, 25))),
    description: 30,
  };

  // Header
  const header = [
    ''.padEnd(cols.status),
    'Name'.padEnd(cols.name),
    'Executor'.padEnd(cols.executor),
    'Settings'.padEnd(cols.settings),
    'Description'.padEnd(cols.description),
  ].join('  ');

  const separator = [
    '-'.repeat(cols.status),
    '-'.repeat(cols.name),
    '-'.repeat(cols.executor),
    '-'.repeat(cols.settings),
    '-'.repeat(cols.description),
  ].join('  ');

  log.plain(header);
  log.plain(separator);

  // Rows
  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i]!;
    const status = agent.enabled ? '●' : '○';
    const settings = truncate(settingsStrs[i]!, cols.settings);
    const description = truncate(agent.description, cols.description);

    const row = [
      status.padEnd(cols.status),
      agent.name.padEnd(cols.name),
      agent.executor.padEnd(cols.executor),
      settings.padEnd(cols.settings),
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
  log.plain(`Description: ${agent.description}`);
  log.plain(`Enabled: ${agent.enabled ? 'Yes' : 'No'}`);
  log.plain(`Order: ${agent.order}`);
  log.plain(`Executor: ${agent.executor}`);

  // Show executorSettings if present
  if (agent.executorSettings && Object.keys(agent.executorSettings).length > 0) {
    log.newline();
    log.plain('Executor Settings:');
    for (const [key, value] of Object.entries(agent.executorSettings)) {
      log.plain(`  ${key}: ${value}`);
    }
  }

  log.newline();
  log.plain('System Prompt:');
  log.separator('─');
  log.plain(agent.systemPrompt || '(no prompt)');
  log.separator('─');
}

