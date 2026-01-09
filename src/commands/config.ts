import { spawnSync } from 'node:child_process';
import {
  loadConfig,
  saveConfig,
  resetConfig,
  getConfigPath,
  configExists,
  type Config,
} from '../config';
import { log } from '../logger';

/**
 * Show current configuration
 */
export async function showConfig(): Promise<void> {
  const config = await loadConfig();
  const path = getConfigPath();

  log.plain('Current Configuration\n');
  log.plain(`Location: ${path}\n`);
  log.plain(JSON.stringify(config, null, 2));
}

/**
 * Initialize configuration file
 */
export async function initConfig(): Promise<void> {
  const exists = await configExists();

  if (exists) {
    log.warn('Configuration file already exists');
    log.plain(`Location: ${getConfigPath()}`);
    log.plain("\nUse 'diffray config show' to view current configuration");
    log.plain("Use 'diffray config reset' to reset to defaults");
    return;
  }

  const config = await loadConfig(); // This will create default config
  log.success('Configuration file created');
  log.plain(`Location: ${getConfigPath()}\n`);
  log.plain(JSON.stringify(config, null, 2));
}

/**
 * Reset configuration to defaults
 */
export async function resetConfigCommand(): Promise<void> {
  const config = await resetConfig();
  log.success('Configuration reset to defaults');
  log.plain(JSON.stringify(config, null, 2));
}

/**
 * Set a configuration value
 */
export async function setConfigValue(key: string, value: string): Promise<void> {
  const config = await loadConfig();

  // Parse the key path (e.g., "output.colorize" -> ["output", "colorize"])
  const keys = key.split('.');

  // Root-level keys that can be set directly
  const rootKeys = ['concurrency'];
  // Nested sections
  const nestedSections = ['output'];

  // Parse value based on type
  const parseValue = (val: string, field: string): string | number | boolean => {
    const stringOnlyFields = ['apiKey', 'url', 'baseUrl'];
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (!stringOnlyFields.includes(field) && !isNaN(Number(val))) return Number(val);
    return val;
  };

  let updated: Config;

  if (keys.length === 1) {
    // Root-level key (e.g., "concurrency")
    const rootKey = keys[0]!;

    if (!rootKeys.includes(rootKey)) {
      log.error(`Invalid root key: ${rootKey}`);
      log.plain(`Valid root keys: ${rootKeys.join(', ')}`);
      log.plain(`Valid sections: ${nestedSections.join(', ')} (use section.key format)`);
      process.exit(1);
    }

    const parsedValue = parseValue(value, rootKey);
    updated = { ...config, [rootKey]: parsedValue };
  } else if (keys.length === 2) {
    // Nested key (e.g., "output.colorize")
    const [section, field] = keys as [string, string];

    if (!nestedSections.includes(section)) {
      log.error(`Invalid section: ${section}`);
      log.plain(`Valid root keys: ${rootKeys.join(', ')}`);
      log.plain(`Valid sections: ${nestedSections.join(', ')}`);
      process.exit(1);
    }

    const currentSection = config[section as keyof Config];
    if (typeof currentSection !== 'object' || currentSection === null) {
      log.error(`Invalid section: ${section}`);
      process.exit(1);
    }

    const parsedValue = parseValue(value, field);
    updated = {
      ...config,
      [section]: { ...currentSection, [field]: parsedValue },
    };
  } else {
    log.error('Invalid key format. Use: key or section.key');
    log.plain(`Examples: concurrency, output.colorize`);
    process.exit(1);
  }

  try {
    await saveConfig(updated);
    log.success(`Updated ${key} = ${value}`);
  } catch (error) {
    log.error(`Failed to update config: ${error}`);
    process.exit(1);
  }
}

/**
 * Get a configuration value
 */
export async function getConfigValue(key: string): Promise<void> {
  const config = await loadConfig();

  const keys = key.split('.');
  if (keys.length !== 2) {
    log.error('Invalid key format. Use format: section.key (e.g., ai.provider)');
    process.exit(1);
  }

  const section = keys[0];
  const field = keys[1];

  if (!section || !field) {
    log.error('Invalid key format. Use format: section.key (e.g., ai.provider)');
    process.exit(1);
  }

  const sectionData = config[section as keyof Config];

  if (!sectionData || typeof sectionData !== 'object') {
    log.error(`Invalid section: ${section}`);
    process.exit(1);
  }

  const value = (sectionData as Record<string, unknown>)[field];
  if (value === undefined) {
    log.error(`Invalid key: ${field}`);
    process.exit(1);
  }

  log.plain(String(value));
}

/**
 * Edit configuration file in default editor
 */
export async function editConfig(): Promise<void> {
  const path = getConfigPath();
  const exists = await configExists();

  if (!exists) {
    await initConfig();
  }

  const editor = process.env.EDITOR || 'nano';
  log.info(`Opening ${path} in ${editor}...`);

  const result = spawnSync(editor, [path], { stdio: 'inherit' });
  if (result.error) {
    log.error(`Failed to open editor: ${result.error.message}`);
    process.exit(1);
  }
}
