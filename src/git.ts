import git from 'isomorphic-git';
import fs from 'node:fs/promises';
import * as Diff from 'diff';
import type { GitDiff } from './types.js';

/**
 * Status matrix row type: [filepath, HEAD, WORKDIR, STAGE]
 */
type StatusRow = [string, number, number, number];

/**
 * Cached status matrix to avoid repeated git calls
 */
let cachedStatusMatrix: StatusRow[] | null = null;

/**
 * Get status matrix (cached)
 */
async function getStatusMatrix(): Promise<StatusRow[]> {
  if (cachedStatusMatrix === null) {
    cachedStatusMatrix = (await git.statusMatrix({ fs, dir: process.cwd() })) as StatusRow[];
  }
  return cachedStatusMatrix;
}

/**
 * Clear cached status matrix (call when git state changes)
 */
export function clearStatusCache(): void {
  cachedStatusMatrix = null;
}

/**
 * Check if current directory is a git repository
 */
export async function isGitRepository(): Promise<boolean> {
  try {
    await git.findRoot({ fs, filepath: process.cwd() });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get list of changed files
 */
export async function getChangedFiles(): Promise<string[]> {
  try {
    const statusMatrix = await getStatusMatrix();
    const files = statusMatrix
      .filter(([_, head, workdir, stage]) => head !== workdir || workdir !== stage)
      .map(([filepath]) => filepath);
    return [...new Set(files)];
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
      const headCommit = await git.resolveRef({ fs, dir: process.cwd(), ref: 'HEAD' });
      const { blob } = await git.readBlob({
        fs,
        dir: process.cwd(),
        oid: headCommit,
        filepath: file,
      });
      oldContent = new TextDecoder().decode(blob);
    } catch {
      // File is new, no HEAD version
      oldContent = '';
    }

    try {
      newContent = await fs.readFile(file, 'utf-8');
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
 * Get file status from cached status matrix
 */
export async function getFileStatus(file: string): Promise<GitDiff['status']> {
  try {
    const statusMatrix = await getStatusMatrix();
    const statusRow = statusMatrix.find(([filepath]) => filepath === file);

    if (!statusRow) {
      return 'modified';
    }

    const [_, head, workdir, stage] = statusRow;

    if (head === 0) return 'added';
    if (workdir === 0) return 'deleted';
    if (head !== workdir || workdir !== stage) return 'modified';

    return 'modified';
  } catch {
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
      } catch {
        // Skip files that can't be diffed (e.g., deleted files not yet staged)
        return null;
      }
    })
  );

  return diffs.filter((d): d is GitDiff => d !== null).filter((d) => d.diff.trim().length > 0);
}
