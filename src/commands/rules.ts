/**
 * Commands for managing rules
 */

import { loadRules, saveRules, addRule, removeRule, matchPattern } from "../rules";
import type { Rule } from "../types";
import { log } from "../logger";

/**
 * List all rules
 */
export async function listRules(): Promise<void> {
  const rules = await loadRules();

  if (rules.length === 0) {
    log.warn("No rules configured");
    log.newline();
    log.plain("Add a rule with:");
    log.plain('  diffray rules add <id> <name> <patterns> <agent>');
    log.newline();
    log.plain("Example:");
    log.plain('  diffray rules add ts-review "TypeScript Review" "**/*.ts,**/*.tsx" code-review');
    return;
  }

  log.robot("Rules");
  log.newline();

  for (const rule of rules) {
    log.plain(`[${rule.id}] ${rule.name}`);
    log.plain(`   Patterns: ${rule.patterns.join(', ')}`);
    log.plain(`   Agent: ${rule.agent}`);
    if (rule.prompt) {
      log.plain(`   Prompt: ${rule.prompt.substring(0, 60)}${rule.prompt.length > 60 ? '...' : ''}`);
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
 * Add new rule
 */
export async function addNewRule(
  id: string,
  name: string,
  patterns: string,  // Comma-separated patterns
  agent: string,
  prompt: string  // Required: what to check for
): Promise<void> {
  const patternArray = patterns.split(',').map(p => p.trim());

  const rule: Rule = {
    id,
    name,
    description: `Match ${patternArray.join(', ')} files`,
    patterns: patternArray,
    agent,
    prompt,
  };

  await addRule(rule);
}

/**
 * Remove rule
 */
export async function removeRuleCommand(ruleId: string): Promise<void> {
  await removeRule(ruleId);
}

/**
 * Update rule patterns
 */
export async function updateRulePattern(ruleId: string, patterns: string): Promise<void> {
  const rules = await loadRules();
  const rule = rules.find((r) => r.id === ruleId);

  if (!rule) {
    log.error(`Rule not found: ${ruleId}`);
    process.exit(1);
  }

  rule.patterns = patterns.split(',').map(p => p.trim());
  await saveRules(rules);
  log.success(`Updated patterns for rule: ${rule.name}`);
}

/**
 * Update rule agent
 */
export async function updateRuleAgent(ruleId: string, agent: string): Promise<void> {
  const rules = await loadRules();
  const rule = rules.find((r) => r.id === ruleId);

  if (!rule) {
    log.error(`Rule not found: ${ruleId}`);
    process.exit(1);
  }

  rule.agent = agent;
  await saveRules(rules);
  log.success(`Updated agent for rule: ${rule.name}`);
}

/**
 * Update rule prompt
 */
export async function updateRulePrompt(ruleId: string, prompt: string): Promise<void> {
  const rules = await loadRules();
  const rule = rules.find((r) => r.id === ruleId);

  if (!rule) {
    log.error(`Rule not found: ${ruleId}`);
    process.exit(1);
  }

  rule.prompt = prompt;
  await saveRules(rules);
  log.success(`Updated prompt for rule: ${rule.name}`);
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
    // Match if file matches ANY of the patterns
    const isMatch = rule.patterns.some(pattern => matchPattern(file, pattern));

    if (isMatch) {
      matched.push(file);
    } else {
      notMatched.push(file);
    }
  }

  log.success(`Matched ${matched.length} file(s):`);
  for (const file of matched) {
    log.plain(`  ✅ ${file}`);
  }

  if (notMatched.length > 0) {
    log.newline();
    log.plain(`Not matched ${notMatched.length} file(s):`);
    for (const file of notMatched) {
      log.plain(`  ❌ ${file}`);
    }
  }
}

