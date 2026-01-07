/**
 * Unified cache utility
 * Centralizes all caching logic for file contents, config, and other data
 */

type CacheEntry<T> = {
  value: T;
  timestamp: number;
};

const cache = new Map<string, CacheEntry<unknown>>();

/**
 * Get cached value or load it using the provided loader
 * @param key - Cache key
 * @param loader - Async function to load the value if not cached
 * @returns Cached or freshly loaded value
 */
export async function getCached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const entry = cache.get(key);
  if (entry !== undefined) {
    return entry.value as T;
  }

  const value = await loader();
  cache.set(key, { value, timestamp: Date.now() });
  return value;
}

/**
 * Get cached value synchronously (for values that were pre-loaded)
 * Returns undefined if not in cache
 */
export function getCachedSync<T>(key: string): T | undefined {
  const entry = cache.get(key);
  return entry?.value as T | undefined;
}

/**
 * Set a value in cache directly
 */
export function setCache<T>(key: string, value: T): void {
  cache.set(key, { value, timestamp: Date.now() });
}

/**
 * Invalidate a specific cache entry
 */
export function invalidateCache(key: string): void {
  cache.delete(key);
}

/**
 * Invalidate multiple cache entries by prefix
 */
export function invalidateCacheByPrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

/**
 * Clear all cache entries
 */
export function clearAllCache(): void {
  cache.clear();
}

/**
 * Get all cache keys (for debugging)
 */
export function getCacheKeys(): string[] {
  return [...cache.keys()];
}

// ============ Cache Key Constants ============

export const CACHE_KEYS = {
  // Config
  CONFIG: 'config',
  INSTRUCTIONS: 'instructions',

  // Prompts (executors)
  OUTPUT_FORMAT: 'prompt:output-format',
  VALIDATION_PROMPT: 'prompt:validation',

  // Git
  GIT_STATUS: 'git:status',
} as const;
