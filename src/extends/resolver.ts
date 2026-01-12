/**
 * Resolver for extend references
 *
 * Handles path resolution for git-based extends
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ExtendRef, ResolvedExtend } from './types';
import { getExtendDirName } from './parser';

/**
 * Get the base directory for all extends
 */
export function getExtendsDir(): string {
  return join(homedir(), '.diffray', 'extends');
}

/**
 * Get the lock file path
 */
export function getLockfilePath(): string {
  return join(homedir(), '.diffray', 'extends.lock.json');
}

/**
 * Get the local path for a specific extend
 */
export function getExtendLocalPath(ref: ExtendRef): string {
  return join(getExtendsDir(), getExtendDirName(ref));
}

/**
 * Resolve an extend reference to local path
 * Returns all info needed to clone
 */
export function resolveExtend(ref: ExtendRef, refString: string): ResolvedExtend {
  return {
    ref,
    refString,
    localPath: getExtendLocalPath(ref),
  };
}
