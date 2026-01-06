import { $ } from "bun";

export interface GitDiff {
  file: string;
  status: "modified" | "added" | "deleted" | "renamed";
  diff: string;
  additions: number;
  deletions: number;
}

/**
 * Check if current directory is a git repository
 */
export async function isGitRepository(): Promise<boolean> {
  try {
    const result = await $`git rev-parse --is-inside-work-tree`.quiet();
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Get list of changed files
 */
export async function getChangedFiles(): Promise<string[]> {
  try {
    // Get unstaged changes
    const unstaged = await $`git diff --name-only`.text();
    // Get staged changes
    const staged = await $`git diff --cached --name-only`.text();

    const files = new Set([
      ...unstaged.split("\n").filter(Boolean),
      ...staged.split("\n").filter(Boolean),
    ]);

    return Array.from(files);
  } catch (error) {
    throw new Error(`Failed to get changed files: ${error}`);
  }
}

/**
 * Get diff for a specific file
 */
export async function getFileDiff(file: string): Promise<string> {
  try {
    // Try to get diff from staged changes first
    let diff = await $`git diff --cached ${file}`.text();
    
    // If no staged changes, get unstaged diff
    if (!diff.trim()) {
      diff = await $`git diff ${file}`.text();
    }
    
    return diff;
  } catch (error) {
    throw new Error(`Failed to get diff for ${file}: ${error}`);
  }
}

/**
 * Get file status
 */
export async function getFileStatus(file: string): Promise<GitDiff["status"]> {
  try {
    const result = await $`git status --porcelain ${file}`.text();
    const statusCode = result.trim().substring(0, 2);
    
    if (statusCode.includes("M")) return "modified";
    if (statusCode.includes("A")) return "added";
    if (statusCode.includes("D")) return "deleted";
    if (statusCode.includes("R")) return "renamed";
    
    return "modified";
  } catch {
    return "modified";
  }
}

/**
 * Count additions and deletions in diff
 */
function countDiffChanges(diff: string): { additions: number; deletions: number } {
  const lines = diff.split("\n");
  let additions = 0;
  let deletions = 0;

  for (const line of lines) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      additions++;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      deletions++;
    }
  }

  return { additions, deletions };
}

/**
 * Get all git diffs for changed files
 */
export async function getAllDiffs(): Promise<GitDiff[]> {
  const files = await getChangedFiles();

  const diffs = await Promise.all(
    files.map(async (file) => {
      try {
        const [diff, status] = await Promise.all([
          getFileDiff(file),
          getFileStatus(file),
        ]);

        const { additions, deletions } = countDiffChanges(diff);

        return {
          file,
          status,
          diff,
          additions,
          deletions,
        };
      } catch (error) {
        // Skip files that can't be diffed (e.g., deleted files not yet staged)
        return null;
      }
    })
  );

  return diffs
    .filter((d): d is GitDiff => d !== null)
    .filter((d) => d.diff.trim().length > 0);
}

