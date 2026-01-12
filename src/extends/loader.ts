/**
 * Loader for agents and rules from extends
 *
 * Loads MD files from installed extensions and marks them with source: 'extends'
 */

import { join } from 'node:path';
import type { Agent } from '../types';
import type { RuleRefData } from '../md-loader';
import { loadAgentsFromDirectory } from '../agents/md-loader';
import { scanRuleRefs } from '../md-loader';
import { loadLockfile } from './lockfile';
import { validateExtendPath } from './downloader';
import { log } from '../logger';

/**
 * Get paths to all installed extends
 * Returns array of local paths for installed extensions
 */
export async function getInstalledExtendPaths(extendRefs: string[]): Promise<string[]> {
  const lock = await loadLockfile();
  const paths: string[] = [];

  for (const refString of extendRefs) {
    const entry = lock.packages[refString];
    if (entry) {
      // Validate path from lockfile to prevent path traversal
      validateExtendPath(entry.path);
      paths.push(entry.path);
    } else {
      log.warn(`Extension not installed: ${refString}. Run 'diffray extends install'`);
    }
  }

  return paths;
}

/**
 * Load agents from all extends
 * Returns agents with source: 'extends'
 */
export async function loadAgentsFromExtends(extendRefs: string[]): Promise<Agent[]> {
  const paths = await getInstalledExtendPaths(extendRefs);
  const allAgents: Agent[] = [];

  for (const extendPath of paths) {
    const agentsDir = join(extendPath, 'agents');
    try {
      const agents = await loadAgentsFromDirectory(agentsDir);
      // Mark all agents with source: 'extends'
      allAgents.push(
        ...agents.map((agent) => ({
          ...agent,
          source: 'extends' as const,
        }))
      );
    } catch {
      // No agents directory in this extend - that's ok
    }
  }

  return allAgents;
}

/**
 * Scan rule refs from all extends
 * Returns refs with source: 'extends'
 */
export async function scanRuleRefsFromExtends(extendRefs: string[]): Promise<RuleRefData[]> {
  const paths = await getInstalledExtendPaths(extendRefs);
  const allRefs: RuleRefData[] = [];

  for (const extendPath of paths) {
    const rulesDir = join(extendPath, 'rules');
    try {
      const refs = await scanRuleRefs(rulesDir, 'extends');
      allRefs.push(...refs);
    } catch {
      // No rules directory in this extend - that's ok
    }
  }

  return allRefs;
}

/**
 * Load from extends subdirectory using a generic loader
 * Used by loadWithPriorityAndExtends
 */
export async function loadFromExtends<T>(
  subdir: string,
  loader: (dirPath: string) => Promise<T[]>,
  extendRefs: string[]
): Promise<T[][]> {
  const paths = await getInstalledExtendPaths(extendRefs);
  const results: T[][] = [];

  for (const extendPath of paths) {
    const targetDir = join(extendPath, subdir);
    try {
      const items = await loader(targetDir);
      results.push(items);
    } catch {
      // Directory doesn't exist - return empty
      results.push([]);
    }
  }

  return results;
}
