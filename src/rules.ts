import type { Rule, RuleRef, Agent, MatchedRule, GitDiff } from './types';
import {
  parseMarkdown,
  loadMarkdownFile,
  loadMarkdownDirectoryRecursive,
  loadRuleRefsWithPriority,
  parseFrontmatter,
  type Frontmatter,
} from './md-loader';
import { readFile } from 'node:fs/promises';
import { log } from './logger';
import { loadConfig } from './config';

// ============ Rule Markdown Parsing ============

function buildRule(frontmatter: Frontmatter, body: string): Rule | null {
  const name = frontmatter.name;
  const agent = frontmatter.agent;
  const patterns = frontmatter.patterns;
  const prompt = body.trim();

  // Validate required fields
  if (typeof name !== 'string' || typeof agent !== 'string') {
    return null;
  }

  if (!Array.isArray(patterns) || patterns.length === 0) {
    return null;
  }

  if (!prompt) {
    return null;
  }

  const rule: Rule = {
    name,
    description: typeof frontmatter.description === 'string' ? frontmatter.description : '',
    patterns: patterns.filter((p): p is string => typeof p === 'string'),
    agent,
    prompt,
  };

  return rule;
}

export function parseRuleMarkdown(content: string): Rule[] {
  return parseMarkdown(content, buildRule);
}

export async function loadRuleMarkdown(filePath: string): Promise<Rule[]> {
  try {
    return await loadMarkdownFile<Rule>(filePath, buildRule);
  } catch (error) {
    log.error(`Error loading rule markdown from ${filePath}:`, error);
    return [];
  }
}

export async function loadRulesFromDirectoryRecursive(dirPath: string): Promise<Rule[]> {
  return loadMarkdownDirectoryRecursive(dirPath, buildRule);
}

export function parseSingleRule(content: string): Rule | null {
  const rules = parseRuleMarkdown(content);
  return rules.length > 0 ? (rules[0] ?? null) : null;
}

// ============ Rule Loading ============

/**
 * Load rule refs from MD files (lightweight, no prompts)
 *
 * Loads rule refs from all sources (defaults, user, project) with priority merge.
 * Applies config.rules overrides (enabled, agent) and filters disabled rules.
 * Prompts are loaded lazily via loadRuleFromRef when needed.
 */
export async function loadRuleRefs(projectPath?: string): Promise<RuleRef[]> {
  const resolvedProjectPath = projectPath || process.cwd();
  const refs = await loadRuleRefsWithPriority(resolvedProjectPath);

  // Apply config.rules overrides (with project config)
  const config = await loadConfig(resolvedProjectPath);

  return refs
    .map((ref) => {
      const override = config.rules[ref.name] || {};
      return {
        ...ref,
        // Apply agent override if present
        agent: override.agent ?? ref.agent,
        // Track enabled state (default true)
        _enabled: override.enabled ?? true,
      };
    })
    .filter((ref) => ref._enabled !== false)
    .map(({ _enabled, ...ref }) => ref); // Remove internal _enabled field
}

/**
 * Load full rule content from a RuleRef (reads prompt from file)
 */
export async function loadRuleFromRef(ref: RuleRef): Promise<Rule | null> {
  try {
    const content = await readFile(ref.path, 'utf-8');
    const { body } = parseFrontmatter(content);

    return {
      name: ref.name,
      description: ref.description,
      patterns: ref.patterns,
      agent: ref.agent,
      prompt: body.trim(),
      source: ref.source,
      path: ref.path,
    };
  } catch (error) {
    log.error(`Failed to load rule from ${ref.path}:`, error);
    return null;
  }
}

/**
 * Load full rules from refs (batch loading)
 */
export async function loadRulesFromRefs(refs: RuleRef[]): Promise<Rule[]> {
  const results = await Promise.all(refs.map(loadRuleFromRef));
  return results.filter((rule): rule is Rule => rule !== null);
}

/**
 * Load full rules from all sources
 * @deprecated Use loadRuleRefs + loadRulesFromRefs for lazy loading
 */
export async function loadRules(projectPath?: string): Promise<Rule[]> {
  const refs = await loadRuleRefs(projectPath);
  return loadRulesFromRefs(refs);
}

// ============ Rule Matching ============

// Internal generic matching function
function matchItems<T extends { patterns: string[]; agent: string }>(
  items: T[],
  diffs: GitDiff[],
  agents: Agent[]
): { item: T; files: string[]; agent: Agent }[] {
  const agentMap = new Map(agents.map((a) => [a.name, a]));
  const matched: { item: T; files: string[]; agent: Agent }[] = [];

  for (const item of items) {
    const agent = agentMap.get(item.agent);
    if (!agent) {
      log.warn(`Rule references unknown agent "${item.agent}"`);
      continue;
    }

    const matchedFiles = diffs
      .filter((diff) => item.patterns.some((pattern) => matchPattern(diff.file, pattern)))
      .map((diff) => diff.file);

    if (matchedFiles.length === 0) continue;

    matched.push({ item, files: matchedFiles, agent });
  }

  return matched;
}

/**
 * Match rule refs to files (no prompt loading)
 * Returns refs with matched files for lazy loading
 */
export function matchRuleRefs(
  refs: RuleRef[],
  diffs: GitDiff[],
  agents: Agent[]
): { ref: RuleRef; files: string[]; agent: Agent }[] {
  return matchItems(refs, diffs, agents).map(({ item, ...rest }) => ({ ref: item, ...rest }));
}

/**
 * Match rules and load prompts only for matched rules
 * More efficient than loading all rules then matching
 */
export async function matchAndLoadRules(
  refs: RuleRef[],
  diffs: GitDiff[],
  agents: Agent[]
): Promise<MatchedRule[]> {
  // First match by patterns (no file I/O)
  const matchedRefs = matchRuleRefs(refs, diffs, agents);

  // Then load prompts in parallel for matched rules only
  const loadedRules = await Promise.all(
    matchedRefs.map(async ({ ref, files, agent }) => {
      const rule = await loadRuleFromRef(ref);
      return rule ? { rule, files, agent } : null;
    })
  );

  return loadedRules.filter((r): r is MatchedRule => r !== null);
}

/**
 * Match rules to files based on glob patterns
 * @deprecated Use matchAndLoadRules for lazy loading
 */
export function matchRules(rules: Rule[], diffs: GitDiff[], agents: Agent[]): MatchedRule[] {
  return matchItems(rules, diffs, agents).map(({ item, ...rest }) => ({ rule: item, ...rest }));
}

// ============ Pattern Matching ============

/**
 * Cached regex for brace expansion
 */
const BRACE_REGEX = /\{([^}]+)\}/;

/**
 * Expand brace patterns like {a,b,c} into multiple patterns
 */
export function expandBraces(pattern: string): string[] {
  const braceMatch = pattern.match(BRACE_REGEX);
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
