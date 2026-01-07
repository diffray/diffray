import type { Rule } from '../types.js';
import {
  parseMarkdown,
  loadMarkdownFile,
  loadMarkdownDirectory,
  loadMarkdownDirectoryRecursive,
  type Frontmatter,
} from '../md-loader.js';
import { log } from '../logger.js';

function buildRule(frontmatter: Frontmatter, body: string): Rule | null {
  const id = frontmatter.id;
  const name = frontmatter.name;
  const agent = frontmatter.agent;
  const patterns = frontmatter.patterns;
  const prompt = body.trim();

  // Validate required fields
  if (typeof id !== 'string' || typeof name !== 'string' || typeof agent !== 'string') {
    return null;
  }

  if (!Array.isArray(patterns) || patterns.length === 0) {
    return null;
  }

  if (!prompt) {
    return null;
  }

  const rule: Rule = {
    id,
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

export async function loadRulesFromDirectory(dirPath: string): Promise<Rule[]> {
  return loadMarkdownDirectory(dirPath, buildRule);
}

export async function loadRulesFromDirectoryRecursive(dirPath: string): Promise<Rule[]> {
  return loadMarkdownDirectoryRecursive(dirPath, buildRule);
}

export function parseSingleRule(content: string): Rule | null {
  const rules = parseRuleMarkdown(content);
  return rules.length > 0 ? (rules[0] ?? null) : null;
}
