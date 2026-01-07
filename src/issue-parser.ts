/**
 * Parse issues from agent output (JSON only)
 */

import type { Issue, IssueSeverity, IssueCategory } from './types';

/**
 * Raw issue item from JSON parsing
 */
interface RawIssueItem {
  file?: string;
  lineStart?: number;
  lineEnd?: number;
  line?: number;
  severity?: string;
  category?: string;
  shortDescription?: string;
  short?: string;
  message?: string;
  fullDescription?: string;
  description?: string;
  suggestion?: string;
  agent?: string;
}

/**
 * Parse issue item from JSON object
 */
function parseIssueItem(item: RawIssueItem, agent?: string): Issue {
  return {
    file: item.file || '',
    lineStart: item.lineStart || item.line || 0,
    lineEnd: item.lineEnd || item.lineStart || item.line || 0,
    severity: (item.severity || 'medium') as IssueSeverity,
    category: (item.category || 'quality') as IssueCategory,
    shortDescription: item.shortDescription || item.short || item.message || '',
    fullDescription: item.fullDescription || item.description || item.shortDescription || '',
    suggestion: item.suggestion,
    agent: agent ?? item.agent ?? 'unknown',
  };
}

/**
 * Extract JSON array from text (handles extra text around JSON)
 */
function extractJsonArray(text: string): RawIssueItem[] | null {
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return null;

  try {
    const data = JSON.parse(jsonMatch[0]);
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

/**
 * Extract content from Claude CLI JSON envelope
 * Claude CLI returns: {"type":"result","result":"```json\n[...]\n```"}
 */
function extractClaudeCliResult(text: string): string | null {
  try {
    const data = JSON.parse(text) as { type?: string; result?: string };
    if (data.type === 'result' && typeof data.result === 'string') {
      // Strip markdown code blocks if present
      let result = data.result;
      const codeBlockMatch = result.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        result = codeBlockMatch[1]?.trim() ?? result;
      }
      return result;
    }
  } catch (e) {
    // JSON parse failed - log in debug mode
    if (process.env.DEBUG) {
      console.warn('extractClaudeCliResult JSON parse failed:', e);
    }
  }
  return null;
}

/**
 * Parse issues from JSON output
 */
export function parseIssues(output: string, agent: string): Issue[] {
  try {
    let textToParse = output;

    // Check for Claude CLI envelope format first
    const cliResult = extractClaudeCliResult(output);
    if (cliResult) {
      textToParse = cliResult;
    }

    // Try direct parse first
    let issues: RawIssueItem[] | null = null;

    try {
      const data = JSON.parse(textToParse) as RawIssueItem[] | { issues?: RawIssueItem[] };
      issues = Array.isArray(data) ? data : (data.issues ?? null);
    } catch {
      // Try extracting JSON array from text
      issues = extractJsonArray(textToParse);
    }

    if (!Array.isArray(issues)) {
      return [];
    }

    return issues
      .map((item) => parseIssueItem(item, agent))
      .filter((issue) => issue.file && issue.shortDescription && issue.lineStart > 0);
  } catch {
    return [];
  }
}
