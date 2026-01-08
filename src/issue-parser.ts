/**
 * Parse issues from agent output (JSON only)
 */

import type { Issue, IssueSeverity, IssueCategory } from './types';

/**
 * Raw issue item from JSON parsing
 * Supports multiple field name variations that LLMs might return
 */
interface RawIssueItem {
  // File path
  file?: string;
  path?: string;

  // Line numbers
  lineStart?: number;
  lineEnd?: number;
  line?: number;
  lineNumber?: number;

  // Severity
  severity?: string;

  // Category (may be called "type" by some agents)
  category?: string;
  type?: string;

  // Short description variations
  shortDescription?: string;
  short?: string;
  message?: string;
  issue?: string;
  title?: string;
  problem?: string;

  // Full description variations
  fullDescription?: string;
  description?: string;
  evidence?: string;
  detail?: string;
  details?: string;
  explanation?: string;

  // Suggestion variations
  suggestion?: string;
  fix?: string;
  recommendation?: string;
  remediation?: string;
  solution?: string;

  agent?: string;
}

/**
 * Parse issue item from JSON object
 * Handles multiple field name variations
 */
function parseIssueItem(item: RawIssueItem, agent?: string): Issue {
  const file = item.file || item.path || '';
  // Use ?? for line numbers to preserve explicit 0 values (which will be filtered out)
  // Default to 1 only if no line info provided at all
  const lineStart = item.lineStart ?? item.line ?? item.lineNumber ?? 1;
  const lineEnd = item.lineEnd ?? item.lineStart ?? item.line ?? item.lineNumber ?? lineStart;

  // Map category from various field names (type is common alternative)
  const category = item.category || item.type || 'quality';

  // Map short description from various field names
  const shortDescription =
    item.shortDescription ||
    item.short ||
    item.message ||
    item.issue ||
    item.title ||
    item.problem ||
    '';

  // Map full description from various field names
  const fullDescription =
    item.fullDescription ||
    item.description ||
    item.evidence ||
    item.detail ||
    item.details ||
    item.explanation ||
    shortDescription;

  // Map suggestion from various field names
  const suggestion =
    item.suggestion || item.fix || item.recommendation || item.remediation || item.solution;

  return {
    file,
    lineStart,
    lineEnd,
    severity: (item.severity || 'medium') as IssueSeverity,
    category: category as IssueCategory,
    shortDescription,
    fullDescription,
    suggestion,
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
 * @param output - Raw output string containing JSON
 * @param agent - Optional agent name (if omitted, uses agent from each item)
 */
export function parseIssues(output: string, agent?: string): Issue[] {
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
      .filter(
        (issue) =>
          issue.file && (issue.shortDescription || issue.fullDescription) && issue.lineStart > 0
      );
  } catch {
    return [];
  }
}
