import * as Diff from 'diff';
import type { GitDiff } from './types.js';
import { getCached, invalidateCache, CACHE_KEYS } from './cache';
import { log } from './logger';

const GIT_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Run native git command and return stdout (with timeout)
 */
async function runGit(args: string[], cwd: string = process.cwd()): Promise<string> {
  const proc = Bun.spawn(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });

  // Race between process completion and timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      proc.kill();
      reject(new Error(`git ${args[0]} timeout after ${GIT_TIMEOUT_MS / 1000}s`));
    }, GIT_TIMEOUT_MS);
  });

  const exitCode = await Promise.race([proc.exited, timeoutPromise]);

  if (exitCode === 0) {
    return await new Response(proc.stdout).text();
  } else {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`git ${args[0]} failed: ${stderr || `exit code ${exitCode}`}`);
  }
}

/**
 * Get current branch name
 */
export async function getCurrentBranch(): Promise<string | null> {
  try {
    const result = await runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
    const branch = result.trim();
    return branch === 'HEAD' ? null : branch; // detached HEAD returns null
  } catch (e) {
    log.debug(`getCurrentBranch failed: ${e}`);
    return null;
  }
}

/**
 * Get current HEAD commit SHA
 */
export async function getCurrentHeadSha(): Promise<string> {
  const result = await runGit(['rev-parse', 'HEAD']);
  return result.trim();
}

/**
 * Get commit SHA for a ref (branch, tag, or commit)
 */
export async function getRefSha(ref: string): Promise<string> {
  const result = await runGit(['rev-parse', ref]);
  return result.trim();
}

/**
 * Checkout to a specific ref
 */
export async function checkoutRef(ref: string): Promise<void> {
  await runGit(['checkout', ref]);
  clearStatusCache(); // Clear cache after checkout
}

/**
 * Ensure working directory is at the specified head ref.
 * Returns the original ref/branch if checkout was needed (for restore later).
 */
export async function ensureAtHead(
  headRef: string
): Promise<{ checkoutNeeded: boolean; originalRef: string | null }> {
  const currentSha = await getCurrentHeadSha();
  const targetSha = await getRefSha(headRef);

  if (currentSha === targetSha) {
    return { checkoutNeeded: false, originalRef: null };
  }

  // Save current position (branch name or SHA if detached)
  const currentBranch = await getCurrentBranch();
  const originalRef = currentBranch || currentSha;

  // Checkout to target
  await checkoutRef(headRef);

  return { checkoutNeeded: true, originalRef };
}

/**
 * Check if there are uncommitted changes that would block checkout
 * (ignores untracked files - only checks modified/staged)
 */
export async function hasUncommittedChanges(): Promise<boolean> {
  try {
    // Use --porcelain and filter out untracked files (lines starting with ??)
    const result = await runGit(['status', '--porcelain']);
    const lines = result
      .trim()
      .split('\n')
      .filter((line) => line && !line.startsWith('??'));
    return lines.length > 0;
  } catch (e) {
    log.debug(`hasUncommittedChanges failed: ${e}`);
    return false;
  }
}

/**
 * Status entry from git status --porcelain
 */
interface StatusEntry {
  file: string;
  index: string;  // X - index status
  worktree: string;  // Y - worktree status
}

/**
 * Parse git status --porcelain output
 */
function parseStatus(output: string): StatusEntry[] {
  return output
    .trim()
    .split('\n')
    .filter((line) => line.length >= 3)
    .map((line) => ({
      file: line.slice(3),
      index: line[0] ?? ' ',
      worktree: line[1] ?? ' ',
    }));
}

/**
 * Get status entries (using unified cache)
 */
async function getStatus(): Promise<StatusEntry[]> {
  return getCached(CACHE_KEYS.GIT_STATUS, async () => {
    const output = await runGit(['status', '--porcelain']);
    return parseStatus(output);
  });
}

/**
 * Clear cached status (call when git state changes)
 */
export function clearStatusCache(): void {
  invalidateCache(CACHE_KEYS.GIT_STATUS);
}

/**
 * Check if current directory is a git repository
 */
export async function isGitRepository(): Promise<boolean> {
  try {
    await runGit(['rev-parse', '--git-dir']);
    return true;
  } catch (e) {
    log.debug(`isGitRepository: not a git repo: ${e}`);
    return false;
  }
}

/**
 * Get list of changed files
 */
export async function getChangedFiles(): Promise<string[]> {
  try {
    const status = await getStatus();
    return status.map((entry) => entry.file);
  } catch (error) {
    throw new Error(`Failed to get changed files: ${error}`);
  }
}

/**
 * Get diff for a specific file
 */
export async function getFileDiff(file: string): Promise<string> {
  try {
    let oldContent = '';
    let newContent = '';

    try {
      oldContent = await runGit(['show', `HEAD:${file}`]);
    } catch {
      // File is new, no HEAD version
      oldContent = '';
    }

    try {
      newContent = await Bun.file(file).text();
    } catch {
      // File is deleted, no working version
      newContent = '';
    }

    return Diff.createPatch(file, oldContent, newContent, 'HEAD', 'Working Directory');
  } catch (error) {
    throw new Error(`Failed to get diff for ${file}: ${error}`);
  }
}

/**
 * Get file status from cached status
 */
export async function getFileStatus(file: string): Promise<GitDiff['status']> {
  try {
    const status = await getStatus();
    const entry = status.find((e) => e.file === file);

    if (!entry) {
      return 'modified';
    }

    // Check index (X) and worktree (Y) status
    // A = added, D = deleted, ? = untracked
    if (entry.index === 'A' || entry.index === '?' || entry.worktree === '?') return 'added';
    if (entry.index === 'D' || entry.worktree === 'D') return 'deleted';

    return 'modified';
  } catch (e) {
    log.debug(`getFileStatus failed for ${file}: ${e}`);
    return 'modified';
  }
}

/**
 * Count additions and deletions in diff
 */
function countDiffChanges(diff: string): { additions: number; deletions: number } {
  const lines = diff.split('\n');
  let additions = 0;
  let deletions = 0;

  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions++;
    }
  }

  return { additions, deletions };
}

/**
 * Get all git diffs for changed files
 */
export async function getAllDiffs(): Promise<GitDiff[]> {
  // Clear cache to ensure fresh data
  clearStatusCache();

  const files = await getChangedFiles();

  const diffs = await Promise.all(
    files.map(async (file) => {
      try {
        const [diff, status] = await Promise.all([getFileDiff(file), getFileStatus(file)]);

        const { additions, deletions } = countDiffChanges(diff);

        return {
          file,
          status,
          diff,
          additions,
          deletions,
        };
      } catch (e) {
        // Skip files that can't be diffed (e.g., deleted files not yet staged)
        log.debug(`getAllDiffs: skipping ${file}: ${e}`);
        return null;
      }
    })
  );

  return diffs.filter((d): d is GitDiff => d !== null).filter((d) => d.diff.trim().length > 0);
}

/**
 * Parse git diff --name-status output to get changed files with status
 */
function parseNameStatus(output: string): Array<{ file: string; status: GitDiff['status'] }> {
  return output
    .trim()
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const [statusChar, ...pathParts] = line.split('\t');
      const file = pathParts.join('\t'); // Handle filenames with tabs
      let status: GitDiff['status'] = 'modified';
      if (statusChar === 'A') status = 'added';
      else if (statusChar === 'D') status = 'deleted';
      else if (statusChar?.startsWith('R')) status = 'modified'; // Renamed
      return { file, status };
    })
    .filter((entry) => entry.file);
}

/**
 * Get diffs from the last commit (HEAD vs HEAD~1) using native git
 */
export async function getLastCommitDiffs(): Promise<GitDiff[]> {
  try {
    // Use native git for fast file listing
    const nameStatus = await runGit(['diff', '--name-status', 'HEAD~1', 'HEAD']);
    const changedFiles = parseNameStatus(nameStatus);

    if (changedFiles.length === 0) {
      return [];
    }

    // Get diffs for each file using native git show
    const diffs = await Promise.all(
      changedFiles.map(async ({ file, status }) => {
        try {
          // Get unified diff for this file
          const diff = await runGit(['diff', 'HEAD~1', 'HEAD', '--', file]);
          const { additions, deletions } = countDiffChanges(diff);

          // Convert to patch format if needed
          const patchDiff = diff.startsWith('diff --git')
            ? diff
            : Diff.createPatch(file, '', '', 'HEAD~1', 'HEAD');

          return {
            file,
            status,
            diff: patchDiff,
            additions,
            deletions,
          } as GitDiff;
        } catch (e) {
          log.debug(`getLastCommitDiffs: skipping ${file}: ${e}`);
          return null;
        }
      })
    );

    return diffs.filter((d): d is GitDiff => d !== null && d.diff.trim().length > 0);
  } catch (error) {
    throw new Error(`Failed to get last commit diffs: ${error}`);
  }
}

/**
 * Get diffs between two commits/refs (base vs head) using native git
 * @param baseRef - Base commit/branch/tag to compare from (e.g., 'main', 'HEAD~3', commit SHA)
 * @param headRef - Head commit/branch/tag to compare to (defaults to 'HEAD')
 */
export async function getCommitDiffs(
  baseRef: string,
  headRef: string = 'HEAD'
): Promise<GitDiff[]> {
  try {
    // Use native git for fast file listing (native git handles ref~N syntax)
    const nameStatus = await runGit(['diff', '--name-status', baseRef, headRef]);
    const changedFiles = parseNameStatus(nameStatus);

    if (changedFiles.length === 0) {
      return [];
    }

    // Get diffs for each file using native git
    const diffs = await Promise.all(
      changedFiles.map(async ({ file, status }) => {
        try {
          // Get unified diff for this file
          const diff = await runGit(['diff', baseRef, headRef, '--', file]);
          const { additions, deletions } = countDiffChanges(diff);

          // Convert to patch format if needed
          const patchDiff = diff.startsWith('diff --git')
            ? diff
            : Diff.createPatch(file, '', '', baseRef, headRef);

          return {
            file,
            status,
            diff: patchDiff,
            additions,
            deletions,
          } as GitDiff;
        } catch (e) {
          log.debug(`getCommitDiffs: skipping ${file}: ${e}`);
          return null;
        }
      })
    );

    return diffs.filter((d): d is GitDiff => d !== null && d.diff.trim().length > 0);
  } catch (error) {
    throw new Error(`Failed to get diffs between ${baseRef} and ${headRef}: ${error}`);
  }
}
