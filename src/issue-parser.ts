/**
 * Parse issues from agent output
 */

import type { Issue, IssueSeverity } from './types';

/**
 * Raw issue item from JSON parsing
 */
interface RawIssueItem {
  file?: string;
  lineStart?: number;
  lineEnd?: number;
  line?: number;
  severity?: string;
  shortDescription?: string;
  short?: string;
  message?: string;
  fullDescription?: string;
  description?: string;
  suggestion?: string;
  agentId?: string;
  agentName?: string;
}

/**
 * Parse issues from structured agent output
 * Expected format:
 *
 * FILE: path/to/file.ts
 * LINES: 10-15
 * SEVERITY: error
 * SHORT: Variable 'x' is never used
 * DESCRIPTION: The variable 'x' is declared but never used in the function
 * SUGGESTION: Remove the unused variable or use it in the function
 * ---
 */
export function parseIssues(output: string, agentId: string, agentName: string): Issue[] {
  const issues: Issue[] = [];
  const blocks = output
    .split('---')
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  for (const block of blocks) {
    const issue = parseIssueBlock(block, agentId, agentName);
    if (issue) {
      issues.push(issue);
    }
  }

  return issues;
}

/**
 * Parse a single issue block
 */
function parseIssueBlock(block: string, agentId: string, agentName: string): Issue | null {
  const lines = block.split('\n').map((l) => l.trim());

  let file = '';
  let lineStart = 0;
  let lineEnd = 0;
  let severity: IssueSeverity = 'info';
  let shortDescription = '';
  let fullDescription = '';
  let suggestion: string | undefined;

  for (const line of lines) {
    if (line.startsWith('FILE:')) {
      file = line.substring(5).trim();
    } else if (line.startsWith('LINES:')) {
      const range = line.substring(6).trim();
      const parts = range.split('-');
      const firstPart = parts[0];
      if (firstPart) {
        lineStart = parseInt(firstPart, 10);
        lineEnd = lineStart; // Default to same line
      }
      const secondPart = parts[1];
      if (secondPart) {
        lineEnd = parseInt(secondPart, 10);
      }
    } else if (line.startsWith('SEVERITY:')) {
      const sev = line.substring(9).trim() as IssueSeverity;
      if (['error', 'warning', 'info', 'suggestion'].includes(sev)) {
        severity = sev;
      }
    } else if (line.startsWith('SHORT:')) {
      shortDescription = line.substring(6).trim();
    } else if (line.startsWith('DESCRIPTION:')) {
      fullDescription = line.substring(12).trim();
    } else if (line.startsWith('FULL:')) {
      fullDescription = line.substring(5).trim();
    } else if (line.startsWith('SUGGESTION:')) {
      suggestion = line.substring(11).trim();
    }
  }

  // Validate required fields
  // lineStart must be >= 1 (initialized to 0, so check <= 0)
  if (!file || !shortDescription || lineStart <= 0) {
    return null;
  }

  // Filter out "no action needed" issues
  const noActionPatterns = [
    /no action needed/i,
    /no changes needed/i,
    /this is correct/i,
    /this is fine/i,
    /this is good/i,
    /positive addition/i,
    /good practice/i,
  ];

  const combinedText = `${shortDescription} ${fullDescription} ${suggestion || ''}`.toLowerCase();
  if (noActionPatterns.some((pattern) => pattern.test(combinedText))) {
    return null;
  }

  return {
    file,
    lineStart,
    lineEnd,
    severity,
    shortDescription,
    fullDescription: fullDescription || shortDescription,
    suggestion,
    agentId,
    agentName,
  };
}

/**
 * Parse issue item from JSON object
 */
function parseIssueItem(item: RawIssueItem, agentId?: string, agentName?: string): Issue {
  return {
    file: item.file || '',
    lineStart: item.lineStart || item.line || 0,
    lineEnd: item.lineEnd || item.lineStart || item.line || 0,
    severity: (item.severity || 'info') as IssueSeverity,
    shortDescription: item.shortDescription || item.short || item.message || '',
    fullDescription: item.fullDescription || item.description || item.shortDescription || '',
    suggestion: item.suggestion,
    agentId: agentId ?? item.agentId ?? 'unknown',
    agentName: agentName ?? item.agentName ?? 'Unknown Agent',
  };
}

/**
 * Extract JSON array from text (handles extra text around JSON)
 */
export function extractJsonArray(text: string): RawIssueItem[] | null {
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
 * Parse issues from JSON format
 * @param output - JSON string or text containing JSON
 * @param agentId - Optional agent ID (if not provided, uses value from JSON)
 * @param agentName - Optional agent name (if not provided, uses value from JSON)
 */
export function parseIssuesFromJSON(output: string, agentId?: string, agentName?: string): Issue[] {
  try {
    // Try direct parse first
    let issues: RawIssueItem[] | null = null;

    try {
      const data = JSON.parse(output) as RawIssueItem[] | { issues?: RawIssueItem[] };
      issues = Array.isArray(data) ? data : (data.issues ?? null);
    } catch {
      // Try extracting JSON array from text
      issues = extractJsonArray(output);
    }

    if (!Array.isArray(issues)) {
      return [];
    }

    return issues
      .map((item) => parseIssueItem(item, agentId, agentName))
      .filter((issue) => issue.file && issue.shortDescription && issue.lineStart > 0);
  } catch {
    return [];
  }
}

/**
 * Try to parse issues from any format
 */
export function parseIssuesAuto(output: string, agentId: string, agentName: string): Issue[] {
  // Try JSON first
  if (output.trim().startsWith('{') || output.trim().startsWith('[')) {
    const jsonIssues = parseIssuesFromJSON(output, agentId, agentName);
    if (jsonIssues.length > 0) {
      return jsonIssues;
    }
  }

  // Try structured format
  return parseIssues(output, agentId, agentName);
}
