/**
 * Cache management commands
 */

import { log } from '../logger';
import { getConfigPath, loadConfig, resetConfig, invalidateConfigCache } from '../config';

/**
 * Show cache information
 */
export async function showCache(): Promise<void> {
  log.robot('Configuration Information');
  log.newline();

  const configPath = getConfigPath();
  log.plain(`Location: ${configPath}`);
  log.newline();

  // Check if config file exists
  const configFile = Bun.file(configPath);
  if (!(await configFile.exists())) {
    log.info('Configuration file does not exist (using defaults)');
    return;
  }

  // Show file information
  const stats = await configFile.stat();
  const size = (stats.size / 1024).toFixed(2);
  const modified = stats.mtime.toLocaleString();

  log.success(`config.json`);
  log.plain(`  Size: ${size} KB`);
  log.plain(`  Modified: ${modified}`);
  log.newline();

  // Try to read and show configuration details
  try {
    const config = await loadConfig();

    log.plain('Contents:');
    if (config.executors) {
      log.plain(`  • Executors: ${config.executors.length}`);
    }
    if (config.stages) {
      log.plain(`  • Stages: ${config.stages.length}`);
    }
    log.newline();
  } catch (e) {
    log.warn(`Failed to parse configuration: ${e}`);
    log.newline();
  }
}

/**
 * Clear all cache files
 */
export async function clearCache(): Promise<void> {
  log.robot('Resetting configuration...');
  log.newline();

  try {
    // Reset configuration to defaults
    await resetConfig();

    // Clear in-memory cache
    invalidateConfigCache();

    log.success('Configuration reset to defaults');
    log.success('In-memory cache cleared');
    log.newline();
    log.success('Configuration reset successfully');
  } catch (error) {
    log.error(`Failed to reset configuration: ${error}`);
  }
}

/**
 * Show what the cache contains
 */
export async function explainCache(): Promise<void> {
  log.robot('About diffray Configuration');
  log.newline();

  log.plain('diffray uses a configuration file (config.json) for settings:');
  log.newline();

  log.plain('Configuration Data:');
  log.plain('  ▸ Executors - Executor configurations');
  log.plain('  ▸ Stages - Pipeline stages configuration');
  log.plain('  ▸ Validation - Validation settings');
  log.newline();
  log.plain('Dynamic Data (always loaded from MD files):');
  log.plain('  ▸ Agents - Loaded from ~/.diffray/agents/ and .diffray/agents/');
  log.plain('  ▸ Rules - Loaded from ~/.diffray/rules/ and .diffray/rules/');
  log.newline();

  log.plain('Location: ~/.diffray/config.json');
  log.newline();

  log.plain('When to reset:');
  log.plain('  • To restore default settings');
  log.plain('  • When troubleshooting configuration issues');
  log.plain('  • If configuration becomes corrupted');
  log.newline();
}
