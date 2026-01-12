/**
 * Rules management - rules are defined in markdown files
 */

import { loadRuleRefs, matchPattern } from '../rules.js';
import { log, formatPath } from '../logger';

/**
 * Format source badge
 */
function sourceBadge(source: string): string {
  switch (source) {
    case 'defaults':
      return '◆'; // built-in
    case 'extends':
      return '○'; // from extends
    case 'user':
      return '◇'; // user override
    case 'project':
      return '●'; // project specific
    default:
      return '?';
  }
}

/**
 * List all rules from config cache
 */
export async function listRules(): Promise<void> {
  const rules = await loadRuleRefs();

  if (rules.length === 0) {
    log.warn('No rules configured');
    return;
  }

  log.robot('Rules');
  log.newline();

  for (const rule of rules) {
    const badge = sourceBadge(rule.source);
    const path = formatPath(rule.path);

    log.plain(`${badge} ${rule.name}`);
    log.plain(`  agent: ${rule.agent}`);
    log.plain(`  patterns: ${rule.patterns.join(', ')}`);
    log.plain(`  path: ${path}`);
    log.newline();
  }

  log.plain('◆ defaults  ○ extends  ◇ user  ● project');
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
