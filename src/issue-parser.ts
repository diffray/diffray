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

  // Line numbers (can be number or string like "137-139")
  lineStart?: number | string;
  lineEnd?: number | string;
  line?: number | string;
  lineNumber?: number | string;

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
  detail?: string;
  details?: string;
  explanation?: string;

  // Suggestion variations
  suggestion?: string;
  fix?: string;
  recommendation?: string;
  remediation?: string;
  solution?: string;

  // Evidence - concrete code that proves the issue
  evidence?: string;

  // Confidence - certainty level 0-100
  confidence?: number | string;

  agent?: string;
  rule?: string;
}

/**
 * Parse line number from string or number value
 * Returns positive number if valid, or defaultValue otherwise
 */
function parseLineNumber(value: string | number | undefined, defaultValue: number = 1): number {
  if (value === undefined || value === null) return defaultValue;

  const num = typeof value === 'number' ? value : parseInt(String(value).trim(), 10);
  return !isNaN(num) && num > 0 ? num : defaultValue;
}

/**
 * Get line start from item, trying multiple field names
 * Only cascades if field is not provided; invalid values (0, negative) are preserved for filtering
 */
function getLineStart(item: RawIssueItem): number {
  if (item.lineStart !== undefined) return parseLineNumber(item.lineStart, 0);
  if (item.line !== undefined) return parseLineNumber(item.line, 0);
  if (item.lineNumber !== undefined) return parseLineNumber(item.lineNumber, 0);
  return 1; // Default when no field provided
}

/**
 * Parse issue item from JSON object
 * Handles multiple field name variations
 */
function parseIssueItem(item: RawIssueItem, agent?: string): Issue {
  const file = item.file || item.path || '';

  // Parse line numbers
  const lineStart = getLineStart(item);
  const lineEnd = parseLineNumber(item.lineEnd, lineStart);

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
    item.detail ||
    item.details ||
    item.explanation ||
    shortDescription;

  // Map suggestion from various field names
  const suggestion =
    item.suggestion || item.fix || item.recommendation || item.remediation || item.solution;

  // Evidence - concrete code that proves the issue
  const evidence = item.evidence;

  // Confidence - certainty level 0-100
  let confidence: number | undefined;
  if (typeof item.confidence === 'number') {
    confidence = item.confidence;
  } else if (typeof item.confidence === 'string') {
    const parsed = parseInt(item.confidence, 10);
    confidence = isNaN(parsed) ? undefined : parsed;
  }

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
    rule: item.rule,
    evidence,
    confidence,
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
 * Extract JSON from <json>...</json> XML tags
 */
function extractJsonFromXmlTags(text: string): string | null {
  const match = text.match(/<json>\s*([\s\S]*?)\s*<\/json>/);
  return match?.[1]?.trim() ?? null;
}

/**
 * Extract content from Claude CLI JSON envelope
 * Claude CLI returns: {"type":"result","result":"<json>[...]</json>"}
 */
function extractClaudeCliResult(text: string): string | null {
  try {
    const data = JSON.parse(text) as { type?: string; result?: string };
    if (data.type === 'result' && typeof data.result === 'string') {
      let result = data.result;

      // First try <json>...</json> XML tags (most reliable)
      const xmlTagContent = extractJsonFromXmlTags(result);
      if (xmlTagContent) {
        return xmlTagContent;
      }

      // Fall back to ```json code block
      const jsonCodeBlockMatch = result.match(/```json\s*([\s\S]*?)```/);
      if (jsonCodeBlockMatch) {
        return jsonCodeBlockMatch[1]?.trim() ?? result;
      }

      // Last resort: any code block with JSON content
      const allCodeBlocks = result.matchAll(/```(?:\w*)?\s*([\s\S]*?)```/g);
      for (const match of allCodeBlocks) {
        const content = match[1]?.trim();
        if (content?.startsWith('[') || content?.startsWith('{')) {
          return content;
        }
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

    // 1. Check for Claude CLI envelope format {"type":"result","result":"..."}
    //    This handles JSON escaped content properly
    const cliResult = extractClaudeCliResult(output);
    if (cliResult) {
      textToParse = cliResult;
    } else {
      // 2. Try <json>...</json> XML tags directly (for plain text with tags)
      const xmlTagContent = extractJsonFromXmlTags(output);
      if (xmlTagContent) {
        textToParse = xmlTagContent;
      }
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
