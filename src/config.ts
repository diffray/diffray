import { z } from 'zod';
import { join } from 'path';
import { homedir } from 'os';
import type { Agent, RuleRef } from './types';
import { getCached, setCache, invalidateCache, CACHE_KEYS } from './cache';

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
  validation: z
    .object({
      executor: z.string().optional(), // Executor name (e.g., 'cerebras-api', 'claude-cli')
      model: z.string().optional(), // Model override (e.g., 'haiku', 'llama-3.3-70b')
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
const INSTRUCTIONS_FILE = join(CONFIG_DIR, 'instructions.md');

export function getDefaultConfig(): Config {
  return ConfigSchema.parse({});
}

export async function loadConfig(): Promise<Config> {
  return getCached(CACHE_KEYS.CONFIG, async () => {
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
      return ConfigSchema.parse(json);
    } catch (error) {
      console.warn(`Warning: Failed to load config, using defaults. Error: ${error}`);
      return getDefaultConfig();
    }
  });
}

export async function saveConfig(config: Config): Promise<void> {
  try {
    await Bun.$`mkdir -p ${CONFIG_DIR}`.quiet();
    await Bun.write(CONFIG_FILE, JSON.stringify(config, null, 2));
    setCache(CACHE_KEYS.CONFIG, config);
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
  invalidateCache(CACHE_KEYS.CONFIG);
  invalidateCache(CACHE_KEYS.INSTRUCTIONS);
}

/**
 * Load global instructions from ~/.diffray/instructions.md
 * Returns empty string if file doesn't exist
 */
export async function loadInstructions(): Promise<string> {
  return getCached(CACHE_KEYS.INSTRUCTIONS, async () => {
    try {
      const file = Bun.file(INSTRUCTIONS_FILE);
      const exists = await file.exists();

      if (!exists) {
        return '';
      }

      return await file.text();
    } catch {
      return '';
    }
  });
}

export function getInstructionsPath(): string {
  return INSTRUCTIONS_FILE;
}

// Agents and rules are cached from MD files for performance
export function getAgents(config: Config): Agent[] {
  return config.agents || [];
}

export function getRuleRefs(config: Config): RuleRef[] {
  return config.rules || [];
}