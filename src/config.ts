import { z } from 'zod';
import { join } from 'path';
import { homedir } from 'os';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { getCached, invalidateCache, CACHE_KEYS } from './cache';

// Schema for stage settings within an executor
const StageSettingsSchema = z.object({
  model: z.string().optional(),
  timeout: z.number().positive().optional(),
  concurrency: z.number().min(1).max(10).optional(),
  batchSize: z.number().min(1).max(50).optional(),
});

// Schema for executor-specific settings (per stage)
const ExecutorSettingsSchema = z.object({
  review: StageSettingsSchema.optional(),
  validation: StageSettingsSchema.optional(),
});

// Schema for agent override settings
const AgentOverrideSchema = z.object({
  enabled: z.boolean().optional(),
  model: z.string().optional(),
  timeout: z.number().positive().optional(),
});

// Schema for rule override settings
const RuleOverrideSchema = z.object({
  enabled: z.boolean().optional(),
  agent: z.string().optional(),
});

export const ConfigSchema = z.object({
  extends: z.array(z.string()).default([]),
  excludePatterns: z
    .array(z.string())
    .default([
      '*.min.js',
      '*.min.css',
      '*.map',
      '*.d.ts',
      'dist/**',
      'build/**',
      'out/**',
      '.next/**',
      'coverage/**',
      'node_modules/**',
      'vendor/**',
      '*.generated.*',
      '*.bundle.js',
    ]),
  concurrency: z.number().min(1).max(10).default(6),
  executor: z.string().default('claude-cli'),
  executors: z.record(z.string(), ExecutorSettingsSchema).default({}),
  agents: z.record(z.string(), AgentOverrideSchema).default({}),
  rules: z.record(z.string(), RuleOverrideSchema).default({}),
  output: z
    .object({
      colorize: z.boolean().default(true),
      verbose: z.boolean().default(false),
      format: z.enum(['terminal', 'markdown', 'json']).default('terminal'),
    })
    .default({}),
});

export type Config = z.infer<typeof ConfigSchema>;

// Global config paths
const GLOBAL_CONFIG_DIR = join(homedir(), '.diffray');
const GLOBAL_CONFIG_FILE = join(GLOBAL_CONFIG_DIR, 'config.json');
const INSTRUCTIONS_FILE = join(GLOBAL_CONFIG_DIR, 'instructions.md');

// Project config file (in project root)
const PROJECT_CONFIG_FILE = '.diffray.json';

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

/**
 * Load config from a specific file path
 */
async function loadConfigFile(filePath: string): Promise<Partial<Config> | null> {
  const exists = await fileExists(filePath);
  if (!exists) return null;

  const content = await readFile(filePath, 'utf-8');
  try {
    return JSON.parse(content);
  } catch (error) {
    const message = error instanceof SyntaxError ? error.message : String(error);
    throw new Error(`Invalid JSON in config file ${filePath}: ${message}`);
  }
}

/**
 * Deep merge two configs (project overrides global)
 */
function mergeConfigs(global: Config, project: Partial<Config>): Config {
  return {
    ...global,
    ...(project.extends !== undefined && { extends: project.extends }),
    ...(project.excludePatterns !== undefined && { excludePatterns: project.excludePatterns }),
    ...(project.concurrency !== undefined && { concurrency: project.concurrency }),
    ...(project.executor !== undefined && { executor: project.executor }),
    executors: project.executors
      ? deepMergeExecutors(global.executors, project.executors)
      : global.executors,
    agents: project.agents ? deepMergeOverrides(global.agents, project.agents) : global.agents,
    rules: project.rules ? deepMergeOverrides(global.rules, project.rules) : global.rules,
    output: project.output ? { ...global.output, ...project.output } : global.output,
  };
}

/**
 * Load merged config (global + project)
 * Priority: defaults < global (~/.diffray/config.json) < project (.diffray.json)
 */
export async function loadConfig(projectPath?: string): Promise<Config> {
  const cacheKey = projectPath ? `${CACHE_KEYS.CONFIG}:${projectPath}` : CACHE_KEYS.CONFIG;

  return getCached(cacheKey, async () => {
    // Start with defaults
    let config = getDefaultConfig();

    // Load global config
    const globalConfig = await loadConfigFile(GLOBAL_CONFIG_FILE);
    if (globalConfig) {
      config = ConfigSchema.parse(mergeConfigs(config, globalConfig));
    }

    // Load project config if projectPath provided
    if (projectPath) {
      const projectConfigPath = join(projectPath, PROJECT_CONFIG_FILE);
      const projectConfig = await loadConfigFile(projectConfigPath);
      if (projectConfig) {
        config = ConfigSchema.parse(mergeConfigs(config, projectConfig));
      }
    }

    return config;
  });
}

/**
 * Save global config to ~/.diffray/config.json
 */
export async function saveGlobalConfig(config: Config): Promise<void> {
  try {
    await mkdir(GLOBAL_CONFIG_DIR, { recursive: true });
    await writeFile(GLOBAL_CONFIG_FILE, JSON.stringify(config, null, 2));
    invalidateCache(CACHE_KEYS.CONFIG);
  } catch (error) {
    throw new Error(`Failed to save global config: ${error}`);
  }
}

/**
 * Initialize project config at .diffray.json
 * Creates minimal config that can override global settings
 */
export async function initProjectConfig(projectPath: string): Promise<string> {
  const configFile = join(projectPath, PROJECT_CONFIG_FILE);

  const exists = await fileExists(configFile);
  if (exists) {
    return configFile; // Already exists
  }

  // Create minimal project config with example structure
  const projectConfig = {
    agents: {},
    rules: {},
  };

  await writeFile(configFile, JSON.stringify(projectConfig, null, 2));
  invalidateCache(CACHE_KEYS.CONFIG);

  return configFile;
}

// Deep merge executor settings
function deepMergeExecutors(
  current: Config['executors'],
  updates: Config['executors']
): Config['executors'] {
  const result = { ...current };
  for (const [execName, execSettings] of Object.entries(updates)) {
    result[execName] = {
      ...result[execName],
      ...execSettings,
      review: execSettings.review
        ? { ...result[execName]?.review, ...execSettings.review }
        : result[execName]?.review,
      validation: execSettings.validation
        ? { ...result[execName]?.validation, ...execSettings.validation }
        : result[execName]?.validation,
    };
  }
  return result;
}

// Deep merge agent/rule overrides
function deepMergeOverrides<T extends Record<string, unknown>>(
  current: Record<string, T>,
  updates: Record<string, T>
): Record<string, T> {
  const result = { ...current };
  for (const [name, settings] of Object.entries(updates)) {
    result[name] = { ...result[name], ...settings } as T;
  }
  return result;
}

/**
 * Get global config file path
 */
export function getGlobalConfigPath(): string {
  return GLOBAL_CONFIG_FILE;
}

/**
 * Get project config file path
 */
export function getProjectConfigPath(projectPath: string): string {
  return join(projectPath, PROJECT_CONFIG_FILE);
}

/**
 * Check if global config exists
 */
export async function globalConfigExists(): Promise<boolean> {
  return fileExists(GLOBAL_CONFIG_FILE);
}

/**
 * Check if project config exists
 */
export async function projectConfigExists(projectPath: string): Promise<boolean> {
  return fileExists(getProjectConfigPath(projectPath));
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
