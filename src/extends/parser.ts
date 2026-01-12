/**
 * Parser for extend reference strings
 *
 * Supports any git URL format with optional #ref suffix:
 * - "https://github.com/owner/repo" - default branch
 * - "https://github.com/owner/repo#v1.0" - specific tag
 * - "https://github.com/owner/repo.git#main" - specific branch
 * - "git@github.com:owner/repo.git" - SSH format, default branch
 * - "git@github.com:owner/repo.git#develop" - SSH format with ref
 * - "https://gitlab.company.com/team/rules.git#v2.0"
 */

import type { ExtendRef } from './types';

// Git URL patterns
const HTTPS_PATTERN = /^https?:\/\/.+/;
const SSH_PATTERN = /^git@.+:.+/;
const SSH_PROTOCOL_PATTERN = /^ssh:\/\/.+/;

/**
 * Parse an extend reference string into structured format
 *
 * @param refString - Git URL with optional #ref suffix
 * @returns Parsed ExtendRef or null if invalid format
 */
export function parseExtendRef(refString: string): ExtendRef | null {
  if (!refString || typeof refString !== 'string') {
    return null;
  }

  // Split by # to get URL and optional ref
  const hashIndex = refString.lastIndexOf('#');
  let url: string;
  let ref: string | undefined;

  if (hashIndex !== -1) {
    url = refString.slice(0, hashIndex);
    ref = refString.slice(hashIndex + 1);

    // Validate ref doesn't contain suspicious characters
    if (!ref || ref.includes('..') || ref.includes('\0')) {
      return null;
    }
  } else {
    url = refString;
  }

  // Validate URL format
  if (!isValidGitUrl(url)) {
    return null;
  }

  return { url, ref };
}

/**
 * Check if a string is a valid git URL
 */
function isValidGitUrl(url: string): boolean {
  return HTTPS_PATTERN.test(url) || SSH_PATTERN.test(url) || SSH_PROTOCOL_PATTERN.test(url);
}

/**
 * Format an ExtendRef back to string format
 *
 * @param ref - ExtendRef object
 * @returns String like "https://github.com/owner/repo#v1.0"
 */
export function formatExtendRef(ref: ExtendRef): string {
  if (ref.ref) {
    return `${ref.url}#${ref.ref}`;
  }
  return ref.url;
}

/**
 * Normalize a ref string (parse and re-format)
 * Git URLs don't need normalization
 * but this ensures the format is valid
 *
 * @param refString - Original ref string
 * @returns Same string if valid, or null if invalid
 */
export function normalizeExtendRef(refString: string): string | null {
  const ref = parseExtendRef(refString);
  if (!ref) {
    return null;
  }
  return refString; // Keep original format
}

/**
 * Get a safe directory name for an extend ref
 * Used for local storage path
 *
 * @param ref - ExtendRef object
 * @returns Safe directory name
 */
export function getExtendDirName(ref: ExtendRef): string {
  // Extract repo name from URL
  let name = ref.url;

  // Remove protocol
  name = name.replace(/^https?:\/\//, '');
  name = name.replace(/^git@/, '');
  name = name.replace(/^ssh:\/\//, '');

  // Remove .git suffix
  name = name.replace(/\.git$/, '');

  // Replace unsafe characters with --
  name = name.replace(/[/:@]/g, '--');

  // Add ref if present
  if (ref.ref) {
    name = `${name}@${ref.ref}`;
  }

  return name;
}

/**
 * Extract repository name from git URL (for display)
 */
export function getRepoDisplayName(ref: ExtendRef): string {
  let name = ref.url;

  // Extract path part
  if (name.startsWith('git@')) {
    // git@github.com:owner/repo.git -> owner/repo
    name = name.replace(/^git@[^:]+:/, '');
  } else {
    // https://github.com/owner/repo.git -> owner/repo
    name = name.replace(/^https?:\/\/[^/]+\//, '');
  }

  // Remove .git suffix
  name = name.replace(/\.git$/, '');

  return name;
}
