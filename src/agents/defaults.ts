/**
 * Default Agents - loads from MD files in defaults/agents directory
 */

import type { Agent } from '../types';
import { loadAgentsFromDirectory } from './md-loader.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Get default Agents from MD files
 */
export async function getDefaultAgents(): Promise<Agent[]> {
  const currentFilePath = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFilePath);
  const agentsDir = join(currentDir, '../defaults/agents');

  try {
    const loadedAgents = await loadAgentsFromDirectory(agentsDir);
    return loadedAgents || [];
  } catch (error) {
    console.error('Failed to load default agents:', error);
    return [];
  }
}
