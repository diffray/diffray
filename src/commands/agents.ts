/**
 * Agent management commands
 *
 * Agents are defined in Markdown files:
 * - Agents are defined in src/defaults/agents/*.md files
 * - Agents are loaded directly from MD files on each run
 * - Enabled/disabled via frontmatter in Markdown files
 */

import { loadAgents } from '../agents.js';
import { log, formatPath } from '../logger';

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

  // Rows - simple format with path
  for (const agent of agents) {
    const status = agent.enabled ? '●' : '○';
    const stage = agent.stage || 'review';
    const path = formatPath(agent.path);

    log.plain(`${status} ${agent.name} (${stage})`);
    log.plain(`  executor: ${agent.executor}`);
    if (agent.executorSettings && Object.keys(agent.executorSettings).length > 0) {
      log.plain(`  settings: ${formatSettings(agent.executorSettings)}`);
    }
    log.plain(`  path: ${path}`);
    log.newline();
  }
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
  log.plain(`Stage: ${agent.stage || 'review'}`);
  log.plain(`Executor: ${agent.executor}`);
  log.plain(`Path: ${formatPath(agent.path)}`);

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
