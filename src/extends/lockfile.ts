/**
 * Lock file management for extends
 *
 * Stores information about installed extensions at ~/.diffray/extends.lock.json
 * Uses file locking to prevent race conditions during concurrent access
 */

import { readFile, writeFile, mkdir, access, rm, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ExtendLock, ExtendLockEntry } from './types';
import { getLockfilePath } from './resolver';

const LOCK_TIMEOUT_MS = 10000; // 10 seconds max wait for lock
const LOCK_RETRY_INTERVAL_MS = 100; // Check every 100ms

/**
 * Get the path for the lock directory (used as mutex)
 */
function getLockDirPath(): string {
  return getLockfilePath() + '.lock';
}

/**
 * Acquire a file lock using mkdir (atomic on most filesystems)
 * Returns a release function
 */
async function acquireLock(): Promise<() => Promise<void>> {
  const lockDir = getLockDirPath();
  const startTime = Date.now();

  while (true) {
    try {
      // mkdir fails if directory already exists - this is our lock mechanism
      await mkdir(lockDir);
      // Lock acquired - return release function
      return async () => {
        try {
          await rm(lockDir, { recursive: true, force: true });
        } catch {
          // Ignore errors on release
        }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        // Lock is held by another process
        if (Date.now() - startTime > LOCK_TIMEOUT_MS) {
          // Timeout - force release stale lock and retry
          await rm(lockDir, { recursive: true, force: true });
          continue;
        }
        // Wait and retry
        await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_INTERVAL_MS));
        continue;
      }
      throw error;
    }
  }
}

/**
 * Execute a function with file lock protection
 */
async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const release = await acquireLock();
  try {
    return await fn();
  } finally {
    await release();
  }
}

/**
 * Create an empty lock file structure
 */
function createEmptyLock(): ExtendLock {
  return {
    version: 1,
    updated: new Date().toISOString(),
    packages: {},
  };
}

/**
 * Load the lock file
 * Returns empty structure if file doesn't exist
 */
export async function loadLockfile(): Promise<ExtendLock> {
  const lockPath = getLockfilePath();

  try {
    await access(lockPath);
    const content = await readFile(lockPath, 'utf-8');
    const data = JSON.parse(content) as ExtendLock;

    // Validate version
    if (data.version !== 1) {
      throw new Error(`Unsupported lock file version: ${data.version}`);
    }

    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return createEmptyLock();
    }
    throw error;
  }
}

/**
 * Save the lock file (internal, use updateLockEntry/removeLockEntry for safe writes)
 */
async function saveLockfileInternal(lock: ExtendLock): Promise<void> {
  const lockPath = getLockfilePath();

  // Ensure directory exists
  await mkdir(dirname(lockPath), { recursive: true });

  // Update timestamp
  lock.updated = new Date().toISOString();

  // Atomic write: write to temp file, then rename
  const tempPath = lockPath + '.tmp.' + process.pid;
  await writeFile(tempPath, JSON.stringify(lock, null, 2), 'utf-8');

  // Rename is atomic on most filesystems
  await rename(tempPath, lockPath);
}

/**
 * Save the lock file (public, for backwards compatibility)
 */
export async function saveLockfile(lock: ExtendLock): Promise<void> {
  await withLock(async () => {
    await saveLockfileInternal(lock);
  });
}

/**
 * Get a lock entry for a specific ref
 */
export async function getLockEntry(refString: string): Promise<ExtendLockEntry | null> {
  const lock = await loadLockfile();
  return lock.packages[refString] || null;
}

/**
 * Update a single lock entry (thread-safe)
 */
export async function updateLockEntry(refString: string, entry: ExtendLockEntry): Promise<void> {
  await withLock(async () => {
    const lock = await loadLockfile();
    lock.packages[refString] = entry;
    await saveLockfileInternal(lock);
  });
}

/**
 * Remove a lock entry (thread-safe)
 */
export async function removeLockEntry(refString: string): Promise<void> {
  await withLock(async () => {
    const lock = await loadLockfile();
    delete lock.packages[refString];
    await saveLockfileInternal(lock);
  });
}

/**
 * Check if an extend is installed and up-to-date
 */
export async function isInstalled(refString: string): Promise<boolean> {
  const entry = await getLockEntry(refString);
  if (!entry) {
    return false;
  }

  // Check if local path exists
  try {
    await access(entry.path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get all installed extends
 */
export async function getInstalledExtends(): Promise<string[]> {
  const lock = await loadLockfile();
  return Object.keys(lock.packages);
}
