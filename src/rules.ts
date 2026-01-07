import type { Rule, RuleRef, Agent, MatchedRule, GitDiff } from './types';
import {
  parseMarkdown,
  loadMarkdownFile,
  loadMarkdownDirectoryRecursive,
  loadRuleRefsWithPriority,
  parseFrontmatter,
  type Frontmatter,
} from './md-loader';
import { loadConfig, updateConfig, getRuleRefs } from './config';
import { log } from './logger';

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
 * Load rule refs from config (lightweight, no prompts)
 */
export async function loadRuleRefs(projectPath?: string): Promise<RuleRef[]> {
  const config = await loadConfig();

  // If cache is empty, sync from MD files
  if (!config.rules || config.rules.length === 0) {
    return syncRulesToConfig(projectPath);
  }

  return getRuleRefs(config);
}

/**
 * Load full rule content from a RuleRef (reads prompt from file)
 */
export async function loadRuleFromRef(ref: RuleRef): Promise<Rule | null> {
  try {
    const content = await Bun.file(ref.path).text();
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
  const rules: Rule[] = [];
  for (const ref of refs) {
    const rule = await loadRuleFromRef(ref);
    if (rule) rules.push(rule);
  }
  return rules;
}

/**
 * Sync rules from MD files to config cache (stores only refs, not prompts)
 */
export async function syncRulesToConfig(projectPath?: string): Promise<RuleRef[]> {
  const resolvedProjectPath = projectPath || process.cwd();

  // Scan all sources and get refs with paths
  const refs = await loadRuleRefsWithPriority(resolvedProjectPath);

  // Save refs to config (no prompts stored)
  await updateConfig({ rules: refs });

  log.info(`Synced ${refs.length} rule refs to config cache`);
  return refs;
}

/**
 * Legacy: Load full rules (for backwards compatibility)
 * @deprecated Use loadRuleRefs + loadRulesFromRefs for lazy loading
 */
export async function loadRules(projectPath?: string): Promise<Rule[]> {
  const refs = await loadRuleRefs(projectPath);
  return loadRulesFromRefs(refs);
}

// ============ Rule Matching ============

/**
 * Match rule refs to files (no prompt loading)
 * Returns refs with matched files for lazy loading
 */
export function matchRuleRefs(
  refs: RuleRef[],
  diffs: GitDiff[],
  agents: Agent[]
): { ref: RuleRef; files: string[]; agent: Agent }[] {
  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const matched: { ref: RuleRef; files: string[]; agent: Agent }[] = [];

  for (const ref of refs) {
    const agent = agentMap.get(ref.agent);
    if (!agent) continue;

    const matchedFiles = diffs
      .filter((diff) => ref.patterns.some((pattern) => matchPattern(diff.file, pattern)))
      .map((diff) => diff.file);

    if (matchedFiles.length === 0) continue;

    matched.push({ ref, files: matchedFiles, agent });
  }

  return matched;
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

  // Then load prompts only for matched rules
  const results: MatchedRule[] = [];
  for (const { ref, files, agent } of matchedRefs) {
    const rule = await loadRuleFromRef(ref);
    if (rule) {
      results.push({ rule, files, agent });
    }
  }

  return results;
}

/**
 * Match rules to files based on glob patterns
 * @deprecated Use matchAndLoadRules for lazy loading
 */
export function matchRules(rules: Rule[], diffs: GitDiff[], agents: Agent[]): MatchedRule[] {
  // Build agent lookup map for O(1) access
  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const matched: MatchedRule[] = [];

  for (const rule of rules) {
    const agent = agentMap.get(rule.agent);
    if (!agent) continue;

    const matchedFiles = diffs
      .filter((diff) => rule.patterns.some((pattern) => matchPattern(diff.file, pattern)))
      .map((diff) => diff.file);

    if (matchedFiles.length === 0) continue;

    matched.push({
      rule,
      files: matchedFiles,
      agent,
    });
  }

  return matched;
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
