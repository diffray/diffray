import { z } from "zod";
import { join } from "path";
import { homedir } from "os";

// Configuration schema
export const ConfigSchema = z
  .object({
    // Backend settings
    backend: z
      .object({
        url: z.string().optional(),
        apiKey: z.string().optional(),
        enabled: z.boolean().default(false),
      })
      .default({}),

  // AI Provider settings
  ai: z
    .object({
      provider: z.enum(["openai", "anthropic", "local", "none"]).default("none"),
      apiKey: z.string().optional(),
      model: z.string().optional(),
      baseUrl: z.string().optional(),
    })
    .default({}),

  // Review settings
  review: z
    .object({
      autoReview: z.boolean().default(false),
      includeTests: z.boolean().default(true),
      maxFilesPerReview: z.number().default(10),
      excludePatterns: z.array(z.string()).default(["*.lock", "*.min.js", "dist/*"]),
    })
    .default({}),

  // Output settings
  output: z
    .object({
      colorize: z.boolean().default(true),
      verbose: z.boolean().default(false),
      format: z.enum(["terminal", "markdown", "json"]).default("terminal"),
    })
    .default({}),
  })
  .refine(
    (config) => !config.backend.enabled || config.backend.url,
    {
      message: "Backend URL is required when backend is enabled",
      path: ["backend", "url"],
    }
  );

export type Config = z.infer<typeof ConfigSchema>;

const CONFIG_DIR = join(homedir(), ".diffray");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

/**
 * Get the default configuration
 */
export function getDefaultConfig(): Config {
  return ConfigSchema.parse({});
}

/**
 * Load configuration from file
 */
export async function loadConfig(): Promise<Config> {
  try {
    const file = Bun.file(CONFIG_FILE);
    const exists = await file.exists();

    if (!exists) {
      // Create default config if it doesn't exist
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
}

/**
 * Save configuration to file
 */
export async function saveConfig(config: Config): Promise<void> {
  try {
    // Ensure config directory exists
    await Bun.$`mkdir -p ${CONFIG_DIR}`.quiet();

    // Write config file
    await Bun.write(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (error) {
    throw new Error(`Failed to save config: ${error}`);
  }
}

/**
 * Update specific config values
 */
export async function updateConfig(updates: Partial<Config>): Promise<Config> {
  const current = await loadConfig();
  const updated: Config = {
    ...current,
    backend: updates.backend ? { ...current.backend, ...updates.backend } : current.backend,
    ai: updates.ai ? { ...current.ai, ...updates.ai } : current.ai,
    review: updates.review ? { ...current.review, ...updates.review } : current.review,
    output: updates.output ? { ...current.output, ...updates.output } : current.output,
  };

  const validated = ConfigSchema.parse(updated);
  await saveConfig(validated);
  return validated;
}

/**
 * Get config file path
 */
export function getConfigPath(): string {
  return CONFIG_FILE;
}

/**
 * Reset configuration to defaults
 */
export async function resetConfig(): Promise<Config> {
  const defaultConfig = getDefaultConfig();
  await saveConfig(defaultConfig);
  return defaultConfig;
}

/**
 * Check if config file exists
 */
export async function configExists(): Promise<boolean> {
  const file = Bun.file(CONFIG_FILE);
  return await file.exists();
}

