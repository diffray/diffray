import { z } from 'zod';
import { join } from 'path';
import { homedir } from 'os';
import type { Agent, Rule } from './types';

export const ConfigSchema = z.object({
  excludePatterns: z.array(z.string()).default(['*.lock', '*.min.js', 'dist/*', 'node_modules/**']),
  concurrency: z.number().min(1).max(10).default(3),
  output: z
    .object({
      colorize: z.boolean().default(true),
      verbose: z.boolean().default(false),
      format: z.enum(['terminal', 'markdown', 'json']).default('terminal'),
    })
    .default({}),
  executors: z.array(z.any()).default([]),
  agents: z.array(z.any()).default([]),
  rules: z.array(z.any()).default([]),
  stages: z
    .array(z.object({ id: z.string(), enabled: z.boolean(), order: z.number().optional() }))
    .default([]),
});

export type Config = z.infer<typeof ConfigSchema>;

const CONFIG_DIR = join(homedir(), '.diffray');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

let configCache: Config | null = null;

export function getDefaultConfig(): Config {
  return ConfigSchema.parse({});
}

export async function loadConfig(): Promise<Config> {
  if (configCache) {
    return configCache;
  }

  try {
    const file = Bun.file(CONFIG_FILE);
    const exists = await file.exists();

    if (!exists) {
      const defaultConfig = getDefaultConfig();
      await saveConfig(defaultConfig);
      return defaultConfig;
    }

    const content = await file.text();
    const json = JSON.parse(content);
    const config = ConfigSchema.parse(json);

    configCache = config;
    return config;
  } catch (error) {
    console.warn(`Warning: Failed to load config, using defaults. Error: ${error}`);
    return getDefaultConfig();
  }
}

export async function saveConfig(config: Config): Promise<void> {
  try {
    await Bun.$`mkdir -p ${CONFIG_DIR}`.quiet();
    await Bun.write(CONFIG_FILE, JSON.stringify(config, null, 2));
    configCache = config;
  } catch (error) {
    throw new Error(`Failed to save config: ${error}`);
  }
}

export async function updateConfig(updates: Partial<Config>): Promise<Config> {
  const current = await loadConfig();
  const updated: Config = {
    ...current,
    excludePatterns:
      updates.excludePatterns !== undefined ? updates.excludePatterns : current.excludePatterns,
    output: updates.output ? { ...current.output, ...updates.output } : current.output,
    executors: updates.executors !== undefined ? updates.executors : current.executors,
    agents: updates.agents !== undefined ? updates.agents : current.agents,
    rules: updates.rules !== undefined ? updates.rules : current.rules,
    stages: updates.stages !== undefined ? updates.stages : current.stages,
  };

  const validated = ConfigSchema.parse(updated);
  await saveConfig(validated);
  return validated;
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export async function resetConfig(): Promise<Config> {
  const defaultConfig = getDefaultConfig();
  await saveConfig(defaultConfig);
  return defaultConfig;
}

export async function configExists(): Promise<boolean> {
  const file = Bun.file(CONFIG_FILE);
  return await file.exists();
}

export function invalidateConfigCache(): void {
  configCache = null;
}

// Agents and rules are cached from MD files for performance
export function getAgents(config: Config): Agent[] {
  return config.agents || [];
}

export function getRules(config: Config): Rule[] {
  return config.rules || [];
}
