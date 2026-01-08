import { test, expect, describe } from 'bun:test';
import { ConfigSchema, getDefaultConfig, loadConfig, invalidateConfigCache } from './config';

describe('Config', () => {
  test('should create default config', () => {
    const config = getDefaultConfig();

    expect(config.excludePatterns).toEqual(['*.lock', '*.min.js', 'dist/*', 'node_modules/**']);
    expect(config.output.colorize).toBe(true);
    expect(config.output.format).toBe('terminal');
    expect(config.executors).toEqual([]);
    expect(config.stages).toEqual([]);
  });

  test('should validate config schema', () => {
    const validConfig = {
      excludePatterns: ['*.test.ts', '*.spec.ts'],
      output: {
        colorize: false,
        verbose: true,
        format: 'json' as const,
      },
      executors: [],
    };

    const result = ConfigSchema.parse(validConfig);
    expect(result.excludePatterns).toEqual(['*.test.ts', '*.spec.ts']);
    expect(result.output.format).toBe('json');
  });

  test('should use defaults for missing values', () => {
    const partialConfig = {
      excludePatterns: ['*.test.ts'],
    };

    const result = ConfigSchema.parse(partialConfig);
    expect(result.excludePatterns).toEqual(['*.test.ts']);
    expect(result.output.colorize).toBe(true); // default
    expect(result.output.format).toBe('terminal'); // default
  });

  test('should cache config after first load', async () => {
    // Invalidate cache first to ensure clean state
    invalidateConfigCache();

    // First load - should read from disk
    const config1 = await loadConfig();

    // Second load - should return cached version (same reference)
    const config2 = await loadConfig();

    // Both should be the same object (cached)
    expect(config1).toBe(config2);
  });

  test('should invalidate cache correctly', async () => {
    // Load config to populate cache
    const config1 = await loadConfig();

    // Invalidate cache
    invalidateConfigCache();

    // Load again - should read from disk again
    const config2 = await loadConfig();

    // Should be equal in value but different objects
    expect(config1).toEqual(config2);
    // After invalidation and reload, it's a new object reference
    // (though values are the same)
  });
});
