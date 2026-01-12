/**
 * Downloader for git repositories
 *
 * Uses git clone to download extends
 */

import { mkdir, rm, readFile } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ResolvedExtend, ExtendManifest } from './types';
import { getExtendsDir } from './resolver';
import { glob } from 'glob';

const execFileAsync = promisify(execFile);

/**
 * Validate that a path is safely contained within the extends directory
 * Prevents path traversal attacks
 */
export function validateExtendPath(localPath: string): void {
  const extendsDir = resolve(getExtendsDir());
  const resolvedPath = resolve(localPath);

  // Check that the resolved path is inside extends directory
  const relativePath = relative(extendsDir, resolvedPath);
  if (relativePath.startsWith('..') || resolve(extendsDir, relativePath) !== resolvedPath) {
    throw new Error(`Invalid extend path: path traversal detected`);
  }

  // Check for suspicious characters in path components
  const pathParts = relativePath.split(/[/\\]/);
  for (const part of pathParts) {
    if (part === '.' || part === '..' || part.includes('\0')) {
      throw new Error(`Invalid extend path: suspicious path component`);
    }
  }
}

/**
 * Clone a git repository
 */
export async function downloadExtend(resolved: ResolvedExtend): Promise<string> {
  const { ref, localPath } = resolved;

  // Validate path before any operations
  validateExtendPath(localPath);

  // Ensure extends directory exists
  await mkdir(getExtendsDir(), { recursive: true });

  // Remove old installation if exists
  await rm(localPath, { recursive: true, force: true });

  // Build git clone command
  const args = ['clone', '--depth', '1'];

  // Add branch/tag if specified
  if (ref.ref) {
    args.push('--branch', ref.ref);
  }

  args.push(ref.url, localPath);

  // Clone with timeout (60s for large repos)
  try {
    await execFileAsync('git', args, { timeout: 60000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Check for common errors
    if (message.includes('not found') || message.includes('does not exist')) {
      throw new Error(`Repository or ref not found: ${ref.url}${ref.ref ? `#${ref.ref}` : ''}`);
    }
    if (message.includes('Authentication failed') || message.includes('Permission denied')) {
      throw new Error(`Authentication failed for: ${ref.url}`);
    }

    throw new Error(`Git clone failed: ${message}`);
  }

  // Get the resolved commit SHA
  const { stdout: commitSha } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
    cwd: localPath,
  });

  // Remove .git directory to save space (we only need the files)
  await rm(join(localPath, '.git'), { recursive: true, force: true });

  return commitSha.trim();
}

/**
 * Verify the structure of a downloaded extend
 * Returns manifest with found agents and rules
 */
export async function verifyExtendStructure(localPath: string): Promise<ExtendManifest> {
  const manifest: ExtendManifest = {
    agents: [],
    rules: [],
  };

  // Scan for agents
  const agentsDir = join(localPath, 'agents');
  try {
    const agentFiles = await glob('*.md', { cwd: agentsDir });
    for (const file of agentFiles) {
      // Extract agent name from frontmatter
      const name = await extractNameFromMarkdown(join(agentsDir, file));
      if (name) {
        manifest.agents.push(name);
      }
    }
  } catch {
    // No agents directory - that's ok
  }

  // Scan for rules (recursive)
  const rulesDir = join(localPath, 'rules');
  try {
    const ruleFiles = await glob('**/*.md', { cwd: rulesDir });
    for (const file of ruleFiles) {
      const name = await extractNameFromMarkdown(join(rulesDir, file));
      if (name) {
        manifest.rules.push(name);
      }
    }
  } catch {
    // No rules directory - that's ok
  }

  return manifest;
}

/**
 * Extract 'name' field from markdown frontmatter
 */
async function extractNameFromMarkdown(filePath: string): Promise<string | null> {
  try {
    const content = await readFile(filePath, 'utf-8');

    if (!content.startsWith('---')) {
      return null;
    }

    const endIndex = content.indexOf('---', 3);
    if (endIndex === -1) {
      return null;
    }

    const frontmatter = content.slice(3, endIndex);
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
    if (nameMatch && nameMatch[1]) {
      return nameMatch[1].trim().replace(/^["']|["']$/g, '');
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Remove an installed extend
 * Validates path before removal to prevent path traversal attacks
 */
export async function removeExtend(localPath: string): Promise<void> {
  // Validate path before removal - defense in depth
  // Lockfile could be maliciously modified to point outside extends directory
  validateExtendPath(localPath);

  await rm(localPath, { recursive: true, force: true });
}
