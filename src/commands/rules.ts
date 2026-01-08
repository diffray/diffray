/**
 * Rules management - rules are defined in markdown files
 */

import { loadRuleRefs, matchPattern } from '../rules.js';
import { log } from '../logger';

/**
 * Truncate string with ellipsis
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 1) + '…';
}

/**
 * Format source badge
 */
function sourceBadge(source: string): string {
  switch (source) {
    case 'defaults':
      return '◆'; // built-in
    case 'user':
      return '◇'; // user override
    case 'project':
      return '●'; // project specific
    default:
      return '○';
  }
}

/**
 * List all rules from config cache
 */
export async function listRules(): Promise<void> {
  const rules = await loadRuleRefs();

  if (rules.length === 0) {
    log.warn('No rules configured');
    log.newline();
    log.plain('Add rule definitions in markdown files and sync with:');
    log.plain('  diffray rules sync');
    log.newline();
    log.plain('Example markdown rule:');
    log.plain('  # Rule: ts-review');
    log.plain('  ## Patterns: **/*.ts,**/*.tsx');
    log.plain('  ## Agent: bug-hunter');
    log.plain('  ## Description: TypeScript code review');
    return;
  }

  log.robot('Rules');
  log.newline();

  // Calculate column widths
  const cols = {
    source: 1,
    name: Math.max(4, ...rules.map((r) => r.name.length)),
    agent: Math.max(5, ...rules.map((r) => r.agent.length)),
    description: 30,
    pattern: Math.max(8, ...rules.flatMap((r) => r.patterns.map((p) => p.length))),
  };

  // Header
  const header = [
    ''.padEnd(cols.source),
    'Rule'.padEnd(cols.name),
    'Agent'.padEnd(cols.agent),
    'Description'.padEnd(cols.description),
    'Patterns'.padEnd(cols.pattern),
  ].join('  ');

  const separator = [
    '-'.repeat(cols.source),
    '-'.repeat(cols.name),
    '-'.repeat(cols.agent),
    '-'.repeat(cols.description),
    '-'.repeat(cols.pattern),
  ].join('  ');

  log.plain(header);
  log.plain(separator);

  // Rows
  for (let idx = 0; idx < rules.length; idx++) {
    const rule = rules[idx]!;
    const description = truncate(rule.description, cols.description);
    const badge = sourceBadge(rule.source);

    // First row with rule info and first pattern
    const firstPattern = rule.patterns[0] ?? '';
    const row = [
      badge.padEnd(cols.source),
      rule.name.padEnd(cols.name),
      rule.agent.padEnd(cols.agent),
      description.padEnd(cols.description),
      firstPattern.padEnd(cols.pattern),
    ].join('  ');

    log.plain(row);

    // Additional patterns on subsequent lines
    for (let i = 1; i < rule.patterns.length; i++) {
      const pattern = rule.patterns[i];
      if (!pattern) continue;
      const patternRow = [
        ''.padEnd(cols.source),
        ''.padEnd(cols.name),
        ''.padEnd(cols.agent),
        ''.padEnd(cols.description),
        pattern.padEnd(cols.pattern),
      ].join('  ');

      log.plain(patternRow);
    }

    // Separator between rules (except after last)
    if (idx < rules.length - 1) {
      log.plain(separator);
    }
  }

  log.newline();
  log.plain('◆ defaults  ◇ user  ● project');
  log.newline();
  log.plain(`Use 'diffray rules show <name>' for full details`);
}

/**
 * Show rule details
 */
export async function showRule(ruleName: string): Promise<void> {
  const { loadRuleFromRef } = await import('../rules.js');
  const refs = await loadRuleRefs();
  const ref = refs.find((r) => r.name === ruleName);

  if (!ref) {
    log.error(`Rule not found: ${ruleName}`);
    process.exit(1);
  }

  // Load full rule content
  const rule = await loadRuleFromRef(ref);
  if (!rule) {
    log.error(`Failed to load rule content from: ${ref.path}`);
    process.exit(1);
  }

  log.robot(`Rule: ${rule.name}`);
  log.newline();
  log.plain(`Source: ${ref.source}`);
  log.plain(`Path: ${ref.path}`);
  log.plain(`Description: ${rule.description}`);
  log.plain(`Patterns: ${rule.patterns.join(', ')}`);
  log.plain(`Agent: ${rule.agent}`);
  if (rule.prompt) {
    log.newline();
    log.plain(`Prompt:`);
    log.separator('─');
    log.plain(rule.prompt);
    log.separator('─');
  }
}

/**
 * Test rule matching
 */
export async function testRule(ruleName: string, files: string[]): Promise<void> {
  const refs = await loadRuleRefs();
  const ref = refs.find((r) => r.name === ruleName);

  if (!ref) {
    log.error(`Rule not found: ${ruleName}`);
    process.exit(1);
  }

  log.robot(`Testing rule: ${ref.name}`);
  log.plain(`Patterns: ${ref.patterns.join(', ')}`);
  log.newline();

  const matched: string[] = [];
  const notMatched: string[] = [];

  for (const file of files) {
    const isMatch = ref.patterns.some((pattern) => matchPattern(file, pattern));

    if (isMatch) {
      matched.push(file);
    } else {
      notMatched.push(file);
    }
  }

  log.success(`Matched ${matched.length} file(s):`);
  for (const file of matched) {
    log.plain(`  ● ${file}`);
  }

  if (notMatched.length > 0) {
    log.newline();
    log.plain(`Not matched ${notMatched.length} file(s):`);
    for (const file of notMatched) {
      log.plain(`  ○ ${file}`);
    }
  }
}

