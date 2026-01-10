/**
 * Executor management commands
 */

import { execFileSync } from 'node:child_process';
import { loadExecutors, getExecutor } from '../executors.js';
import { loadConfig } from '../config.js';
import { log } from '../logger';
import type { AgentExecutor } from '../types.js';

/**
 * Get install command for CLI executor
 */
function getInstallCommand(e: AgentExecutor): string | undefined {
  return e.type === 'cli' ? e.installCommand : undefined;
}

/**
 * Check if a CLI command is available in PATH
 */
function isCommandAvailable(command: string): boolean {
  try {
    execFileSync('which', [command], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Helper to get model from executor (handles union type)
function getModel(e: AgentExecutor): string | undefined {
  return e.type === 'llm-api'
    ? e.model
    : e.type === 'cli'
      ? (e as { model?: string }).model
      : undefined;
}

/**
 * Get available settings from executor's settingsSchema
 */
function getAvailableSettings(executorName: string): string[] {
  const executor = getExecutor(executorName);
  if (!executor?.settingsSchema) return [];

  // Extract field names from Zod schema shape
  const schema = executor.settingsSchema;
  if ('shape' in schema && typeof schema.shape === 'object') {
    return Object.keys(schema.shape as Record<string, unknown>);
  }
  return [];
}

/**
 * List current executor configuration
 */
export async function listExecutors(): Promise<void> {
  const config = await loadConfig(process.cwd());
  const currentExecutor = config.executor;
  const executorConfig = config.executors[currentExecutor] || {};

  log.plain(`Executor: \x1b[36m${currentExecutor}\x1b[0m`);
  log.newline();

  log.plain('Stages:');

  const knownStages = ['review', 'validation'] as const;
  for (const stage of knownStages) {
    const stageConfig = executorConfig[stage];

    const settings: string[] = [];
    if (stageConfig?.model) settings.push(`model=${stageConfig.model}`);
    if (stageConfig?.timeout) settings.push(`timeout=${stageConfig.timeout}`);

    const settingsStr = settings.length > 0 ? ` (${settings.join(', ')})` : '';
    log.plain(`  ${stage.padEnd(12)} → ${currentExecutor}${settingsStr}`);
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
    log.newline();
    log.plain('Available executors:');
    for (const e of executors) {
      log.plain(`  • ${e.name}`);
    }
    process.exit(1);
  }

  log.robot(`Executor: ${executor.name}`);
  log.newline();
  log.plain(`Type: ${executor.type}`);
  log.plain(`Description: ${executor.description}`);

  if (executor.type === 'cli' && executor.command) {
    const command = executor.command;
    const installed = isCommandAvailable(command);
    log.plain(
      `Command: ${command} ${installed ? '\x1b[32m✓\x1b[0m' : '\x1b[33m✗ not installed\x1b[0m'}`
    );
    if (!installed) {
      const installCmd = getInstallCommand(executor);
      if (installCmd) {
        log.plain(`Install: ${installCmd}`);
      }
    }
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

  // Show available settings
  const availableSettings = getAvailableSettings(executorName);
  if (availableSettings.length > 0) {
    log.newline();
    log.plain('Stage Settings (in config.executors.<executor>.<stage>):');
    for (const setting of availableSettings) {
      log.plain(`  • ${setting}`);
    }
  }
}
