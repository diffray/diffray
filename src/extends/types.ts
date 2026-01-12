/**
 * Types for extends feature - loading rules and agents from git repositories
 */

/**
 * Parsed extend reference from config
 * Supports any git URL with optional #ref suffix
 */
export interface ExtendRef {
  url: string; // Git URL (https:// or git@...)
  ref?: string; // Branch, tag, or commit SHA (optional, uses default branch if not specified)
}

/**
 * Lock file entry for a single extension
 */
export interface ExtendLockEntry {
  url: string; // Original git URL
  ref?: string; // Specified ref (if any)
  resolvedRef: string; // Resolved commit SHA
  downloadedAt: string; // ISO timestamp
  path: string; // Local path to downloaded extension
  agents: string[]; // List of agent names found
  rules: string[]; // List of rule names found
}

/**
 * Lock file structure stored at ~/.diffray/extends.lock.json
 */
export interface ExtendLock {
  version: 1;
  updated: string; // ISO timestamp of last update
  packages: Record<string, ExtendLockEntry>; // key is original ref string from config
}

/**
 * Manifest of what was found in an extension
 */
export interface ExtendManifest {
  agents: string[]; // List of agent names
  rules: string[]; // List of rule names
}

/**
 * Resolved extension ready for download
 */
export interface ResolvedExtend {
  ref: ExtendRef;
  refString: string; // Original string from config
  localPath: string; // Where to clone
}
