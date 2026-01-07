/**
 * Rules management for matching agents to files
 */

import { join } from "path";
import { homedir } from "os";
import { z } from "zod";
import type { Rule, Agent, MatchedRule, GitDiff } from "./types";
import { log } from "./logger";

const DIFFRAY_DIR = join(homedir(), ".diffray");
const RULES_FILE = join(DIFFRAY_DIR, "rules.json");

/**
 * Rule schema for validation
 */
export const RuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  patterns: z.array(z.string()),
  agent: z.string(),
  prompt: z.string(),  // Required: main prompt for this rule
});

export const RulesConfigSchema = z.object({
  rules: z.array(RuleSchema).default([]),
});

export type RulesConfig = z.infer<typeof RulesConfigSchema>;

/**
 * Load rules from file
 */
export async function loadRules(): Promise<Rule[]> {
  try {
    const file = Bun.file(RULES_FILE);
    if (!(await file.exists())) {
      return getDefaultRules();
    }

    const data = await file.json();
    const config = RulesConfigSchema.parse(data);
    return config.rules;
  } catch (error) {
    log.warn("Failed to load rules, using defaults");
    return getDefaultRules();
  }
}

/**
 * Save rules to file
 */
export async function saveRules(rules: Rule[]): Promise<void> {
  const config: RulesConfig = { rules };
  await Bun.write(RULES_FILE, JSON.stringify(config, null, 2));
}

/**
 * Get default rules
 */
export function getDefaultRules(): Rule[] {
  return [
    {
      id: "typescript-review",
      name: "TypeScript Review",
      description: "Code review for TypeScript files",
      patterns: ["**/*.ts", "**/*.tsx"],
      agent: "code-review",
      prompt: `Review TypeScript code changes for:
1. Potential bugs or issues
2. Code quality improvements
3. Best practices violations
4. Type safety issues
5. Proper use of TypeScript features

Be concise and actionable.

IMPORTANT: Only report actual issues that need fixing. Do NOT report:
- Documentation improvements that are already good
- Code that is already correct
- Positive observations or compliments
- "No action needed" type comments`,
    },
    {
      id: "typescript-security",
      name: "TypeScript Security",
      description: "Security scan for TypeScript files",
      patterns: ["**/*.ts", "**/*.tsx"],
      agent: "security-scan",
      prompt: `Scan TypeScript code for security vulnerabilities:
1. Authentication/authorization issues
2. Input validation problems
3. SQL injection risks
4. XSS vulnerabilities
5. Sensitive data exposure

Only report actual security concerns. Do NOT report positive observations or "no issues found" messages.`,
    },
    {
      id: "config-security",
      name: "Config Security",
      description: "Security scan for config files",
      patterns: ["**/*.json", "**/*.yaml", "**/*.yml", "**/*.toml"],
      agent: "security-scan",
      prompt: `Scan configuration files for security issues:
1. Hardcoded secrets or credentials
2. Insecure default settings
3. Exposed sensitive information
4. Dangerous permissions

Only report actual security risks. Do NOT report positive observations or "no issues found" messages.`,
    },
  ];
}

/**
 * Match rules to files
 */
export function matchRules(rules: Rule[], diffs: GitDiff[], subAgents: Agent[]): MatchedRule[] {
  const matched: MatchedRule[] = [];

  for (const rule of rules) {
    const matchedFiles = diffs
      .filter((diff) => {
        // Match if file matches ANY of the patterns
        return rule.patterns.some(pattern => matchPattern(diff.file, pattern));
      })
      .map((diff) => diff.file);

    if (matchedFiles.length === 0) continue;

    const subAgent = subAgents.find((a) => a.id === rule.agent);
    if (!subAgent) continue;

    matched.push({
      rule,
      files: matchedFiles,
      subAgent,
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

  const options = braceMatch[1].split(',').map(s => s.trim());
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
  return patterns.some(p => matchSinglePattern(file, p));
}

/**
 * Match file against a single glob pattern (no braces)
 */
function matchSinglePattern(file: string, pattern: string): boolean {
  // Replace glob patterns first (before escaping)
  let regex = pattern
    .replace(/\*\*/g, "\x00DOUBLESTAR\x00") // Placeholder for **
    .replace(/\*/g, "\x00STAR\x00")         // Placeholder for *
    .replace(/\?/g, "\x00QUESTION\x00");    // Placeholder for ?

  // Escape special regex characters
  regex = regex.replace(/[.+^${}()|[\]\\]/g, "\\$&");

  // Replace placeholders with regex patterns
  regex = regex
    .replace(/\x00DOUBLESTAR\x00\//g, "(?:.*\/)?")  // **/ matches any path or nothing
    .replace(/\x00DOUBLESTAR\x00/g, ".*")           // ** matches any path
    .replace(/\x00STAR\x00/g, "[^/]*")              // * matches anything except /
    .replace(/\x00QUESTION\x00/g, ".");             // ? matches single character

  return new RegExp(`^${regex}$`).test(file);
}

/**
 * Add rule
 */
export async function addRule(rule: Rule): Promise<void> {
  const rules = await loadRules();
  rules.push(rule);
  await saveRules(rules);
  log.success(`Added rule: ${rule.name}`);
}

/**
 * Remove rule
 */
export async function removeRule(ruleId: string): Promise<void> {
  const rules = await loadRules();
  const filtered = rules.filter((r) => r.id !== ruleId);
  await saveRules(filtered);
  log.success(`Removed rule: ${ruleId}`);
}



