import git from 'isomorphic-git';
import fs from 'node:fs/promises';
import * as Diff from 'diff';
import { spawn } from 'node:child_process';
import type { GitDiff } from './types.js';

/**
 * Run native git command and return stdout
 */
async function runGit(args: string[], cwd: string = process.cwd()): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => (stdout += data));
    proc.stderr.on('data', (data) => (stderr += data));

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`git ${args[0]} failed: ${stderr || `exit code ${code}`}`));
      }
    });

    proc.on('error', reject);
  });
}

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

    const [, head, workdir, stage] = statusRow;

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
        } catch {
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
        } catch {
          return null;
        }
      })
    );

    return diffs.filter((d): d is GitDiff => d !== null && d.diff.trim().length > 0);
  } catch (error) {
    throw new Error(`Failed to get diffs between ${baseRef} and ${headRef}: ${error}`);
  }
}
