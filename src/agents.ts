import type { Agent } from './types';
import { loadAgentsFromDirectory } from './agents/md-loader.js';
import { loadWithPriority } from './md-loader.js';
import { log } from './logger.js';

/**
 * Load agents from all sources with priority merge
 *
 * Loads agents from all sources (defaults, user, project) with priority merge.
 * This function always loads from MD files without caching.
 *
 * @param projectPath - Path to project root (defaults to process.cwd())
 * @returns Merged agents array from MD sources
 */
export async function loadAgents(projectPath?: string): Promise<Agent[]> {
  const resolvedProjectPath = projectPath || process.cwd();
  return loadWithPriority<Agent>('agents', loadAgentsFromDirectory, resolvedProjectPath);
}