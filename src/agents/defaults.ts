/**
 * Default Agents - loads from MD files in defaults/agents directory
 */

import type { Agent } from '../types';
import { loadAgentsFromDirectory } from './md-loader.js';
import { getDefaultAgentsDir } from '../paths.js';

/**
 * Get default Agents from MD files
 */
export async function getDefaultAgents(): Promise<Agent[]> {
  const agentsDir = getDefaultAgentsDir();

  try {
    const loadedAgents = await loadAgentsFromDirectory(agentsDir);
    return loadedAgents || [];
  } catch (error) {
    console.error('Failed to load default agents:', error);
    return [];
  }
}
