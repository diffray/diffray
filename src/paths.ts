/**
 * Centralized path resolution for defaults directory
 *
 * When bundled into dist/diffray.cjs, __dirname points to the bundled file's directory.
 * The defaults directory is copied to dist/defaults/ during build.
 * This utility provides consistent path resolution that works both in development
 * and when installed as an npm package.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Use import.meta.url for ESM compatibility, fallback to __dirname for CJS bundle
const currentDir =
  typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url));

/**
 * Get the path to the defaults directory.
 * Works both in development (src/) and bundled (dist/).
 */
export function getDefaultsDir(): string {
  return join(currentDir, 'defaults');
}

/**
 * Get the path to the defaults/agents directory
 */
export function getDefaultAgentsDir(): string {
  return join(getDefaultsDir(), 'agents');
}

/**
 * Get the path to the defaults/rules directory
 */
export function getDefaultRulesDir(): string {
  return join(getDefaultsDir(), 'rules');
}

/**
 * Get the path to the defaults/prompts directory
 */
export function getDefaultPromptsDir(): string {
  return join(getDefaultsDir(), 'prompts');
}

/**
 * Get the path to a specific file in defaults directory
 */
export function getDefaultPath(...segments: string[]): string {
  return join(getDefaultsDir(), ...segments);
}
