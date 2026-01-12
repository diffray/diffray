/**
 * Extends command - download/update extends from git repositories
 */

import { loadConfig, addExtendToConfig } from '../config';
import { createLimiter } from '../concurrency';
import { log } from '../logger';
import {
  parseExtendRef,
  resolveExtend,
  downloadExtend,
  verifyExtendStructure,
  updateLockEntry,
  isInstalled,
  loadLockfile,
  removeLockEntry,
  removeExtend,
  getRepoDisplayName,
} from '../extends';

export interface UpdateOptions {
  force?: boolean;
  projectPath?: string;
  url?: string; // Install specific URL instead of from config
  global?: boolean; // Add to global config instead of project config
}

/**
 * Update all extends from config or install specific URL
 */
export async function updateExtends(options: UpdateOptions = {}): Promise<void> {
  const projectPath = options.projectPath || process.cwd();

  // If URL provided, install just that one
  let extendsList: string[];
  if (options.url) {
    extendsList = [options.url];
  } else {
    const config = await loadConfig(projectPath);
    extendsList = config.extends;
  }

  if (extendsList.length === 0) {
    log.info('No extends configured. Add extends to .diffray.json:');
    log.info('  { "extends": ["https://github.com/owner/repo"] }');
    log.info('Or install directly: diffray extends install https://github.com/owner/repo');
    return;
  }

  log.info(`Installing ${extendsList.length} extension(s)...`);
  log.info('');

  // Process extends in parallel with concurrency limit
  const limit = createLimiter(4);

  type InstallResult = {
    status: 'success' | 'skipped' | 'error';
    displayRef: string;
    message?: string;
  };

  const tasks = extendsList.map((refString) =>
    limit(async (): Promise<InstallResult> => {
      const ref = parseExtendRef(refString);

      if (!ref) {
        log.error(`Invalid git URL: ${refString}`);
        log.info('  Expected format: https://github.com/owner/repo or git@host:owner/repo');
        log.info('  Optional ref: https://github.com/owner/repo#v1.0');
        return { status: 'error', displayRef: refString };
      }

      const displayName = getRepoDisplayName(ref);
      const displayRef = ref.ref ? `${displayName}#${ref.ref}` : displayName;

      // Check if already installed (unless force)
      if (!options.force && (await isInstalled(refString))) {
        log.info(`  ${displayRef} - already installed`);
        return { status: 'skipped', displayRef };
      }

      try {
        log.info(`  ${displayRef} - cloning...`);

        // Resolve to local path
        const resolved = resolveExtend(ref, refString);

        // Clone repository
        const commitSha = await downloadExtend(resolved);

        // Verify structure and get manifest
        const manifest = await verifyExtendStructure(resolved.localPath);

        // Update lock file
        await updateLockEntry(refString, {
          url: ref.url,
          ref: ref.ref,
          resolvedRef: commitSha,
          downloadedAt: new Date().toISOString(),
          path: resolved.localPath,
          agents: manifest.agents,
          rules: manifest.rules,
        });

        log.success(
          `  ${displayRef} - installed (${manifest.agents.length} agents, ${manifest.rules.length} rules)`
        );
        return { status: 'success', displayRef };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`  ${displayRef} - failed: ${message}`);
        return { status: 'error', displayRef, message };
      }
    })
  );

  const results = await Promise.all(tasks);

  const successCount = results.filter((r) => r.status === 'success').length;
  const skipCount = results.filter((r) => r.status === 'skipped').length;
  const errorCount = results.filter((r) => r.status === 'error').length;

  // If URL was provided and install succeeded, add to config
  if (options.url && successCount > 0) {
    const configType = options.global ? 'global' : 'project';
    await addExtendToConfig(options.url, !!options.global, projectPath);
    log.success(`Added to ${configType} config`);
  }

  log.info('');
  log.info(`Done: ${successCount} installed, ${skipCount} skipped, ${errorCount} failed`);
}

/**
 * List installed extends
 */
export async function listExtends(): Promise<void> {
  const lock = await loadLockfile();
  const packages = Object.entries(lock.packages);

  if (packages.length === 0) {
    log.info('No extends installed.');
    log.info('Run `diffray extends install` to install extends from config.');
    return;
  }

  log.info(`Installed extends (${packages.length}):`);
  log.info('');

  for (const [refString, entry] of packages) {
    const agentCount = entry.agents.length;
    const ruleCount = entry.rules.length;
    const shortCommit = entry.resolvedRef.slice(0, 7);

    log.info(`  ${refString}`);
    log.info(`    Commit: ${shortCommit}`);
    log.info(`    Agents: ${agentCount > 0 ? entry.agents.join(', ') : '(none)'}`);
    log.info(`    Rules: ${ruleCount > 0 ? entry.rules.join(', ') : '(none)'}`);
    log.info(`    Downloaded: ${entry.downloadedAt}`);
    log.info('');
  }
}

/**
 * Remove an installed extend
 */
export async function removeExtendByRef(refString: string): Promise<void> {
  const ref = parseExtendRef(refString);

  if (!ref) {
    log.error(`Invalid git URL: ${refString}`);
    return;
  }

  if (!(await isInstalled(refString))) {
    log.error(`Extension not installed: ${refString}`);
    return;
  }

  const lock = await loadLockfile();
  const entry = lock.packages[refString];

  if (entry) {
    await removeExtend(entry.path);
    await removeLockEntry(refString);
    const displayName = getRepoDisplayName(ref);
    log.success(`Removed: ${displayName}`);
  }
}
