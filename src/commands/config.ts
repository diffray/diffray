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

  // Parse the key path (e.g., "ai.provider" -> ["ai", "provider"])
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

  // Validate section
  if (!['output'].includes(section)) {
    log.error(`Invalid section: ${section}`);
    log.plain('Valid sections: output');
    log.plain(
      'Note: agents, executors, rules, and stages are managed via their respective commands'
    );
    process.exit(1);
  }

  // Parse value based on type
  // Keep API keys and URLs as strings even if they look like numbers
  const stringOnlyFields = ['apiKey', 'url', 'baseUrl'];
  let parsedValue: string | number | boolean = value;

  if (value === 'true') {
    parsedValue = true;
  } else if (value === 'false') {
    parsedValue = false;
  } else if (!stringOnlyFields.includes(field) && !isNaN(Number(value))) {
    parsedValue = Number(value);
  }

  // Update config
  const sectionKey = section as keyof Config;
  const currentSection = config[sectionKey];

  if (typeof currentSection !== 'object' || currentSection === null) {
    log.error(`Invalid section: ${section}`);
    process.exit(1);
  }

  const updated = {
    ...config,
    [section]: {
      ...currentSection,
      [field]: parsedValue,
    },
  };

  try {
    await saveConfig(updated);
    log.success(`Updated ${key} = ${parsedValue}`);
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

  try {
    await Bun.$`${editor} ${path}`;
  } catch (error) {
    log.error(`Failed to open editor: ${error}`);
    process.exit(1);
  }
}
