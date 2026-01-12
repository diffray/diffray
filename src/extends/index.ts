/**
 * Extends module - loading rules and agents from git repositories
 *
 * Usage:
 * 1. Add extends to config: { "extends": ["https://github.com/owner/repo#v1.0"] }
 * 2. Run `diffray extends install` to download extensions
 * 3. Extensions are automatically loaded during review
 */

// Types
export type {
  ExtendRef,
  ExtendLock,
  ExtendLockEntry,
  ExtendManifest,
  ResolvedExtend,
} from './types';

// Parser
export {
  parseExtendRef,
  formatExtendRef,
  normalizeExtendRef,
  getExtendDirName,
  getRepoDisplayName,
} from './parser';

// Resolver
export { getExtendsDir, getLockfilePath, getExtendLocalPath, resolveExtend } from './resolver';

// Lock file
export {
  loadLockfile,
  saveLockfile,
  getLockEntry,
  updateLockEntry,
  removeLockEntry,
  isInstalled,
  getInstalledExtends,
} from './lockfile';

// Downloader
export { downloadExtend, verifyExtendStructure, removeExtend } from './downloader';

// Loader
export {
  getInstalledExtendPaths,
  loadAgentsFromExtends,
  scanRuleRefsFromExtends,
  loadFromExtends,
} from './loader';
