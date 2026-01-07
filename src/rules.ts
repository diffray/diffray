import type { Rule, Agent, MatchedRule, GitDiff } from './types';
import { loadRulesFromDirectoryRecursive } from './rules/md-loader.js';
import { loadWithPriority } from './md-loader.js';
import { loadConfig, updateConfig, getRules } from './config.js';
import { log } from './logger.js';

/**
 * Load rules from all sources with priority merge (recursive)
 *
 * @param projectPath - Path to project root (defaults to process.cwd())
 * @returns Merged rules array (project overrides user overrides defaults)
 */
export async function loadRules(projectPath?: string): Promise<Rule[]> {
  const config = await loadConfig();

  // If cache is empty, sync rules from MD files
  if (!config.rules || config.rules.length === 0) {
    await syncRulesToConfig(projectPath);
    const updatedConfig = await loadConfig();
    return getRules(updatedConfig);
  }

  return getRules(config);
}

/**
 * Sync rules from MD files to config cache
 *
 * Loads rules from all sources (defaults, user, project) and saves them to config.
 * This ensures the cache is populated with the latest rules from the filesystem.
 *
 * @param projectPath - Path to project root (defaults to process.cwd())
 */
export async function syncRulesToConfig(projectPath?: string): Promise<void> {
  const resolvedProjectPath = projectPath || process.cwd();

  // Load from all sources with priority merge (recursive)
  const mergedRules = await loadWithPriority<Rule>(
    'rules',
    loadRulesFromDirectoryRecursive,
    resolvedProjectPath
  );

  // Save to config cache
  await updateConfig({ rules: mergedRules });

  log.info(`Synced ${mergedRules.length} rules to config cache`);
}

/**
 * Match rules to files based on glob patterns
 */
export function matchRules(rules: Rule[], diffs: GitDiff[], agents: Agent[]): MatchedRule[] {
  const matched: MatchedRule[] = [];

  for (const rule of rules) {
    const matchedFiles = diffs
      .filter((diff) => {
        // Match if file matches ANY of the patterns
        return rule.patterns.some((pattern) => matchPattern(diff.file, pattern));
      })
      .map((diff) => diff.file);

    if (matchedFiles.length === 0) continue;

    const agent = agents.find((a) => a.id === rule.agent);
    if (!agent) continue;

    matched.push({
      rule,
      files: matchedFiles,
      agent,
    });
  }

  return matched;
}

/**
 * Expand brace patterns like {a,b,c} into multiple patterns
 */
export function expandBraces(pattern: string): string[] {
  const braceMatch = pattern.match(/\{([^}]+)\}/);
  if (!braceMatch || braceMatch.index === undefined || !braceMatch[1]) {
    return [pattern];
  }

  const options = braceMatch[1].split(',').map((s) => s.trim());
  const prefix = pattern.substring(0, braceMatch.index);
  const suffix = pattern.substring(braceMatch.index + braceMatch[0].length);

  const expanded: string[] = [];
  for (const option of options) {
    const newPattern = prefix + option + suffix;
    // Recursively expand in case there are more braces
    expanded.push(...expandBraces(newPattern));
  }

  return expanded;
}

/**
 * Match file against glob pattern
 */
export function matchPattern(file: string, pattern: string): boolean {
  // Expand brace patterns first
  const patterns = expandBraces(pattern);

  // Try to match against any of the expanded patterns
  return patterns.some((p) => matchSinglePattern(file, p));
}

/**
 * Cache for compiled RegExp patterns to avoid recompilation
 */
const regexCache = new Map<string, RegExp>();

/**
 * Match file against a single glob pattern (no braces)
 */
function matchSinglePattern(file: string, pattern: string): boolean {
  // Replace glob patterns first (before escaping)
  let regex = pattern
    .replace(/\*\*/g, '\x00DOUBLESTAR\x00') // Placeholder for **
    .replace(/\*/g, '\x00STAR\x00') // Placeholder for *
    .replace(/\?/g, '\x00QUESTION\x00'); // Placeholder for ?

  // Escape special regex characters
  regex = regex.replace(/[.+^${}()|[\]\\]/g, '\\$&');

  // Replace placeholders with regex patterns
  regex = regex
    .replace(/\x00DOUBLESTAR\x00\//g, '(?:.*\\/)?') // **/ matches any path or nothing
    .replace(/\x00DOUBLESTAR\x00/g, '.*') // ** matches any path
    .replace(/\x00STAR\x00/g, '[^/]*') // * matches anything except /
    .replace(/\x00QUESTION\x00/g, '.'); // ? matches single character

  // Check cache for compiled RegExp
  let compiledRegex = regexCache.get(regex);
  if (!compiledRegex) {
    compiledRegex = new RegExp(`^${regex}$`);
    regexCache.set(regex, compiledRegex);
  }

  return compiledRegex.test(file);
}
