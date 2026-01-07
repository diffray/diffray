/**
 * MD-only rules management - rules are defined in markdown files and synced to config cache
 */

import { loadRules, syncRulesToConfig, matchPattern } from '../rules.js';
import { log } from '../logger';

/**
 * List all rules from config cache
 */
export async function listRules(): Promise<void> {
  const rules = await loadRules();

  if (rules.length === 0) {
    log.warn('No rules configured');
    log.newline();
    log.plain('Add rule definitions in markdown files and sync with:');
    log.plain('  diffray rules sync');
    log.newline();
    log.plain('Example markdown rule:');
    log.plain('  # Rule: ts-review');
    log.plain('  ## Patterns: **/*.ts,**/*.tsx');
    log.plain('  ## Agent: code-review');
    log.plain('  ## Description: TypeScript code review');
    return;
  }

  log.robot('Rules');
  log.newline();

  for (const rule of rules) {
    log.plain(`[${rule.id}] ${rule.name}`);
    log.plain(`   Patterns: ${rule.patterns.join(', ')}`);
    log.plain(`   Agent: ${rule.agent}`);
    if (rule.prompt) {
      log.plain(
        `   Prompt: ${rule.prompt.substring(0, 60)}${rule.prompt.length > 60 ? '...' : ''}`
      );
    }
    log.plain(`   ${rule.description}`);
    log.newline();
  }
}

/**
 * Show rule details
 */
export async function showRule(ruleId: string): Promise<void> {
  const rules = await loadRules();
  const rule = rules.find((r) => r.id === ruleId);

  if (!rule) {
    log.error(`Rule not found: ${ruleId}`);
    process.exit(1);
  }

  log.robot(`Rule: ${rule.name}`);
  log.newline();
  log.plain(`ID: ${rule.id}`);
  log.plain(`Description: ${rule.description}`);
  log.plain(`Patterns: ${rule.patterns.join(', ')}`);
  log.plain(`Agent: ${rule.agent}`);
  if (rule.prompt) {
    log.newline();
    log.plain(`Prompt:`);
    log.plain(rule.prompt);
  }
}

/**
 * Test rule matching
 */
export async function testRule(ruleId: string, files: string[]): Promise<void> {
  const rules = await loadRules();
  const rule = rules.find((r) => r.id === ruleId);

  if (!rule) {
    log.error(`Rule not found: ${ruleId}`);
    process.exit(1);
  }

  log.robot(`Testing rule: ${rule.name}`);
  log.plain(`Patterns: ${rule.patterns.join(', ')}`);
  log.newline();

  const matched: string[] = [];
  const notMatched: string[] = [];

  for (const file of files) {
    const isMatch = rule.patterns.some((pattern) => matchPattern(file, pattern));

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

/**
 * Sync rules from MD files to config cache
 */
export async function syncRules(): Promise<void> {
  log.sync('Syncing rules from MD files...');

  try {
    await syncRulesToConfig(process.cwd());
    log.success('Rules synced successfully');
  } catch (error) {
    log.error(`Failed to sync rules: ${error}`);
    process.exit(1);
  }
}
