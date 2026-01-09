import { z } from 'zod';
import { join } from 'path';
import { homedir } from 'os';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { getCached, setCache, invalidateCache, CACHE_KEYS } from './cache';

// Schema for saved executor overrides (partial config stored in config.json)
const ExecutorConfigSchema = z.object({
  name: z.string(),
  enabled: z.boolean().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
  timeout: z.number().positive().optional(),
});

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
  executors: z.array(ExecutorConfigSchema).default([]),
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

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

export async function loadConfig(): Promise<Config> {
  return getCached(CACHE_KEYS.CONFIG, async () => {
    try {
      const exists = await fileExists(CONFIG_FILE);

      if (!exists) {
        const defaultConfig = getDefaultConfig();
        await saveConfig(defaultConfig);
        return defaultConfig;
      }

      const content = await readFile(CONFIG_FILE, 'utf-8');
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
    await mkdir(CONFIG_DIR, { recursive: true });
    await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
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
  return fileExists(CONFIG_FILE);
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
      const exists = await fileExists(INSTRUCTIONS_FILE);
      if (!exists) {
        return '';
      }
      return await readFile(INSTRUCTIONS_FILE, 'utf-8');
    } catch {
      return '';
    }
  });
}

export function getInstructionsPath(): string {
  return INSTRUCTIONS_FILE;
}
