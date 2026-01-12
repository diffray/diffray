import { log } from './logger.js';
import { glob } from 'glob';
import { readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import YAML from 'yaml';
import type { ConfigSource } from './types.js';
import { getDefaultsDir } from './paths.js';

type FrontmatterValue = string | number | boolean | null | FrontmatterValue[];
export type Frontmatter = Record<string, FrontmatterValue>;

interface ParsedMarkdown {
  frontmatter: Frontmatter;
  body: string;
}

function parseFrontmatter(content: string): ParsedMarkdown {
  if (!content || content.trim() === '') {
    return { frontmatter: {}, body: '' };
  }

  if (!content.startsWith('---')) {
    return { frontmatter: {}, body: content };
  }

  const endIndex = content.indexOf('---', 3);
  if (endIndex === -1) {
    throw new Error('Invalid frontmatter: missing closing delimiter ---');
  }

  const frontmatterText = content.slice(3, endIndex).trim();
  const body = content.slice(endIndex + 3).trim();

  if (!frontmatterText) {
    return { frontmatter: {}, body };
  }

  let frontmatter: Frontmatter;
  try {
    frontmatter = YAML.parse(frontmatterText) as Frontmatter;
  } catch (e) {
    throw new Error(`Invalid YAML in frontmatter: ${e instanceof Error ? e.message : String(e)}`);
  }

  return { frontmatter, body };
}

export type MarkdownBuilder<T> = (frontmatter: Frontmatter, body: string) => T | null;

export function parseMarkdown<T>(content: string, builder: MarkdownBuilder<T>): T[] {
  try {
    const { frontmatter, body } = parseFrontmatter(content);
    const item = builder(frontmatter, body);
    return item ? [item] : [];
  } catch (error) {
    log.error('Failed to parse markdown:', error);
    return [];
  }
}

export async function loadMarkdownFile(filePath: string): Promise<ParsedMarkdown>;
export async function loadMarkdownFile<T>(
  filePath: string,
  builder: MarkdownBuilder<T>
): Promise<T[]>;
export async function loadMarkdownFile<T>(
  filePath: string,
  builder?: MarkdownBuilder<T>
): Promise<ParsedMarkdown | T[]> {
  try {
    const content = await readFile(filePath, 'utf-8');

    if (!builder) {
      return parseFrontmatter(content);
    }

    return parseMarkdown(content, builder);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load markdown file "${filePath}": ${error.message}`);
    }
    throw new Error(`Failed to load markdown file "${filePath}": Unknown error`);
  }
}

export async function loadMarkdownDirectory<T>(
  dirPath: string,
  builder: MarkdownBuilder<T>,
  postProcess?: (items: T[]) => T[]
): Promise<T[]> {
  try {
    const mdFiles = await glob('*.md', { cwd: dirPath });

    if (mdFiles.length === 0) {
      log.warn(`No .md files found in directory: ${dirPath}`);
      return [];
    }

    const allItems: T[] = [];

    for (const file of mdFiles) {
      const filePath = join(dirPath, file);
      try {
        const items = await loadMarkdownFile<T>(filePath, builder);
        allItems.push(...items);
      } catch (error) {
        log.error(`Error processing file ${basename(file)}:`, error);
      }
    }

    const finalItems = postProcess ? postProcess(allItems) : allItems;

    log.info(`Loaded ${finalItems.length} items from ${mdFiles.length} files in ${dirPath}`);
    return finalItems;
  } catch (error) {
    // Silently ignore ENOENT (directory doesn't exist) - optional directories are expected
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    log.error(`Error loading from directory ${dirPath}:`, error);
    return [];
  }
}

/**
 * Recursively load markdown files from directory and subdirectories
 */
export async function loadMarkdownDirectoryRecursive<T>(
  dirPath: string,
  builder: MarkdownBuilder<T>,
  postProcess?: (items: T[]) => T[]
): Promise<T[]> {
  try {
    const mdFiles = await glob('**/*.md', { cwd: dirPath });

    if (mdFiles.length === 0) {
      return [];
    }

    const allItems: T[] = [];

    for (const file of mdFiles) {
      const filePath = join(dirPath, file);
      try {
        const items = await loadMarkdownFile(filePath, builder);
        allItems.push(...items);
      } catch (error) {
        log.error(`Error processing file ${file}:`, error);
      }
    }

    const finalItems = postProcess ? postProcess(allItems) : allItems;

    log.info(
      `Loaded ${finalItems.length} items from ${mdFiles.length} files in ${dirPath} (recursive)`
    );
    return finalItems;
  } catch {
    // Directory doesn't exist or can't be accessed - return empty
    return [];
  }
}

/**
 * Merge items by name with priority (later sources override earlier)
 */
export function mergeByName<T extends { name: string }>(...sources: T[][]): T[] {
  const merged = new Map<string, T>();

  for (const source of sources) {
    for (const item of source) {
      merged.set(item.name, item);
    }
  }

  return Array.from(merged.values());
}

/**
 * Get paths for 3-level priority loading (defaults < user < project)
 */
function getPriorityPaths(
  subdir: string,
  projectPath: string
): { defaults: string; user: string; project: string } {
  return {
    defaults: join(getDefaultsDir(), subdir),
    user: join(homedir(), '.diffray', subdir),
    project: join(projectPath, '.diffray', subdir),
  };
}

/**
 * Load items from 3 priority levels and merge by name
 * Priority: defaults < user < project (project overrides all)
 */
export async function loadWithPriority<T extends { name: string }>(
  subdir: string,
  loader: (dirPath: string) => Promise<T[]>,
  projectPath: string
): Promise<T[]> {
  const paths = getPriorityPaths(subdir, projectPath);

  const [defaults, user, project] = await Promise.all([
    loader(paths.defaults),
    loader(paths.user),
    loader(paths.project),
  ]);

  return mergeByName(defaults, user, project);
}

/**
 * Scan directory for rule references (lightweight, no prompt content)
 * Returns array of { name, path, patterns, agent, source }
 */
export interface RuleRefData {
  name: string;
  description: string;
  path: string;
  patterns: string[];
  agent: string;
  source: ConfigSource;
}

export async function scanRuleRefs(dirPath: string, source: ConfigSource): Promise<RuleRefData[]> {
  try {
    const mdFiles = await glob('**/*.md', { cwd: dirPath });

    // Read all files in parallel
    const fileContents = await Promise.all(
      mdFiles.map(async (file) => {
        const filePath = join(dirPath, file);
        try {
          const content = await readFile(filePath, 'utf-8');
          return { filePath, content };
        } catch {
          return null;
        }
      })
    );

    // Process contents and build refs
    const refs: RuleRefData[] = [];
    for (const result of fileContents) {
      if (!result) continue;

      try {
        const { frontmatter } = parseFrontmatter(result.content);
        const name = frontmatter.name;
        const description = frontmatter.description;
        const agent = frontmatter.agent;
        const patterns = frontmatter.patterns;

        if (
          typeof name === 'string' &&
          typeof agent === 'string' &&
          Array.isArray(patterns) &&
          patterns.length > 0
        ) {
          refs.push({
            name,
            description: typeof description === 'string' ? description : '',
            path: result.filePath,
            patterns: patterns.filter((p): p is string => typeof p === 'string'),
            agent,
            source,
          });
        }
      } catch {
        // Skip invalid frontmatter
      }
    }

    return refs;
  } catch {
    return [];
  }
}

/**
 * Load rule refs from all priority levels
 * Returns refs with source info, merged by name (project > user > defaults)
 */
export async function loadRuleRefsWithPriority(projectPath: string): Promise<RuleRefData[]> {
  const paths = getPriorityPaths('rules', projectPath);

  const [defaults, user, project] = await Promise.all([
    scanRuleRefs(paths.defaults, 'defaults'),
    scanRuleRefs(paths.user, 'user'),
    scanRuleRefs(paths.project, 'project'),
  ]);

  // Merge by name - later sources override earlier
  const merged = new Map<string, RuleRefData>();
  for (const ref of [...defaults, ...user, ...project]) {
    merged.set(ref.name, ref);
  }

  return Array.from(merged.values());
}

/**
 * Load items from 4 priority levels including extends and merge by name
 * Priority: defaults < extends (in order) < user < project
 */
export async function loadWithPriorityAndExtends<T extends { name: string }>(
  subdir: string,
  loader: (dirPath: string) => Promise<T[]>,
  projectPath: string,
  extendRefs: string[]
): Promise<T[]> {
  const paths = getPriorityPaths(subdir, projectPath);

  // Import extends loader dynamically to avoid circular dependency
  const { loadFromExtends } = await import('./extends/loader');

  // Load from all sources in parallel
  const [defaults, extendResults, user, project] = await Promise.all([
    loader(paths.defaults),
    loadFromExtends(subdir, loader, extendRefs),
    loader(paths.user),
    loader(paths.project),
  ]);

  // Priority: defaults < extends (in order) < user < project
  return mergeByName(defaults, ...extendResults, user, project);
}

/**
 * Load rule refs from all priority levels including extends
 * Priority: defaults < extends (in order) < user < project
 */
export async function loadRuleRefsWithPriorityAndExtends(
  projectPath: string,
  extendRefs: string[]
): Promise<RuleRefData[]> {
  const paths = getPriorityPaths('rules', projectPath);

  // Import extends loader dynamically to avoid circular dependency
  const { scanRuleRefsFromExtends } = await import('./extends/loader');

  const [defaults, extends_, user, project] = await Promise.all([
    scanRuleRefs(paths.defaults, 'defaults'),
    scanRuleRefsFromExtends(extendRefs),
    scanRuleRefs(paths.user, 'user'),
    scanRuleRefs(paths.project, 'project'),
  ]);

  // Merge by name - later sources override earlier
  const merged = new Map<string, RuleRefData>();
  for (const ref of [...defaults, ...extends_, ...user, ...project]) {
    merged.set(ref.name, ref);
  }

  return Array.from(merged.values());
}

export { parseFrontmatter };
export type { ParsedMarkdown };
