/**
 * Executor management commands
 */

import { loadExecutors } from '../executors.js';
import { updateConfig } from '../config.js';
import { log } from '../logger';
import type { AgentExecutor } from '../types.js';

// Helper to get model from executor (handles union type)
function getModel(e: AgentExecutor): string | undefined {
  return e.type === 'llm-api'
    ? e.model
    : e.type === 'cli'
      ? (e as { model?: string }).model
      : undefined;
}

function getTimeout(e: AgentExecutor): number | undefined {
  return e.type === 'cli' ? e.timeout : undefined;
}

function getTemperature(e: AgentExecutor): number | undefined {
  return e.type === 'llm-api' ? e.temperature : undefined;
}

function getMaxTokens(e: AgentExecutor): number | undefined {
  return e.type === 'llm-api' ? e.maxTokens : undefined;
}

/**
 * List all Executors in table format
 */
export async function listExecutors(): Promise<void> {
  const executors = await loadExecutors();

  log.robot('Available Executors');
  log.newline();

  if (executors.length === 0) {
    log.plain('No Executors configured');
    return;
  }

  // Calculate column widths
  const cols = {
    status: 1,
    name: Math.max(8, ...executors.map((e) => e.name.length)),
    model: Math.max(5, ...executors.map((e) => (getModel(e) || '-').length)),
    timeout: 7,
    temp: 4,
    tokens: 6,
  };

  // Header
  const header = [
    ''.padEnd(cols.status),
    'Executor'.padEnd(cols.name),
    'Model'.padEnd(cols.model),
    'Timeout'.padEnd(cols.timeout),
    'Temp'.padEnd(cols.temp),
    'Tokens'.padEnd(cols.tokens),
  ].join('  ');

  const separator = [
    '-'.repeat(cols.status),
    '-'.repeat(cols.name),
    '-'.repeat(cols.model),
    '-'.repeat(cols.timeout),
    '-'.repeat(cols.temp),
    '-'.repeat(cols.tokens),
  ].join('  ');

  log.plain(header);
  log.plain(separator);

  // Rows
  for (const executor of executors) {
    const status = executor.enabled ? '●' : '○';
    const model = getModel(executor) || '-';
    const timeout = getTimeout(executor) ? `${getTimeout(executor)}s` : '-';
    const temp = getTemperature(executor) !== undefined ? String(getTemperature(executor)) : '-';
    const tokens = getMaxTokens(executor) !== undefined ? String(getMaxTokens(executor)) : '-';

    const row = [
      status.padEnd(cols.status),
      executor.name.padEnd(cols.name),
      model.padEnd(cols.model),
      timeout.padEnd(cols.timeout),
      temp.padEnd(cols.temp),
      tokens.padEnd(cols.tokens),
    ].join('  ');

    log.plain(row);
  }

  log.newline();
}

/**
 * Show Executor details
 */
export async function showExecutor(executorName: string): Promise<void> {
  const executors = await loadExecutors();
  const executor = executors.find((e) => e.name === executorName);

  if (!executor) {
    log.error(`Executor not found: ${executorName}`);
    process.exit(1);
  }

  log.robot(`Executor: ${executor.name}`);
  log.newline();
  log.plain(`Name: ${executor.name}`);
  log.plain(`Type: ${executor.type}`);
  log.plain(`Description: ${executor.description}`);
  log.plain(`Enabled: ${executor.enabled ? 'Yes' : 'No'}`);

  if (executor.type === 'cli') {
    log.plain(`Command: ${executor.command}`);
    log.plain(`Args: ${executor.args?.join(' ') || '(none)'}`);
    const cliModel = getModel(executor);
    if (cliModel) {
      log.plain(`Model: ${cliModel}`);
    }
    log.plain(`Timeout: ${executor.timeout || 60}s`);
  } else if (executor.type === 'llm-api') {
    log.plain(`Provider: ${executor.provider}`);
    log.plain(`Model: ${executor.model}`);
    log.plain(`Temperature: ${executor.temperature ?? 0.7}`);
    log.plain(`Max Tokens: ${executor.maxTokens ?? 4096}`);
  }

  if (executor.type === 'cli' && executor.env) {
    log.newline();
    log.plain('Environment Variables:');
    for (const [key, value] of Object.entries(executor.env)) {
      const maskedValue =
        key.includes('KEY') || key.includes('TOKEN')
          ? String(value).substring(0, 8) + '...'
          : value;
      log.plain(`  ${key}: ${maskedValue}`);
    }
  }
}

/**
 * Enable Executor
 */
export async function enableExecutor(executorName: string): Promise<void> {
  const executors = await loadExecutors();
  const executor = executors.find((e) => e.name === executorName);

  if (!executor) {
    log.error(`Executor not found: ${executorName}`);
    process.exit(1);
  }

  executor.enabled = true;
  await updateConfig({ executors });
  log.success(`Enabled Executor: ${executor.name}`);
}

/**
 * Disable Executor
 */
export async function disableExecutor(executorName: string): Promise<void> {
  const executors = await loadExecutors();
  const executor = executors.find((e) => e.name === executorName);

  if (!executor) {
    log.error(`Executor not found: ${executorName}`);
    process.exit(1);
  }

  executor.enabled = false;
  await updateConfig({ executors });
  log.success(`Disabled Executor: ${executor.name}`);
}
