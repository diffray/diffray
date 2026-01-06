/**
 * Parse issues from agent output
 */

import type { Issue, IssueSeverity } from "./types";

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
  const blocks = output.split("---").map((b) => b.trim()).filter((b) => b.length > 0);

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
  const lines = block.split("\n").map((l) => l.trim());

  let file = "";
  let lineStart = 0;
  let lineEnd = 0;
  let severity: IssueSeverity = "info";
  let shortDescription = "";
  let fullDescription = "";
  let suggestion: string | undefined;

  for (const line of lines) {
    if (line.startsWith("FILE:")) {
      file = line.substring(5).trim();
    } else if (line.startsWith("LINES:")) {
      const range = line.substring(6).trim();
      const parts = range.split("-");
      const firstPart = parts[0];
      if (firstPart) {
        lineStart = parseInt(firstPart, 10);
        lineEnd = lineStart; // Default to same line
      }
      const secondPart = parts[1];
      if (secondPart) {
        lineEnd = parseInt(secondPart, 10);
      }
    } else if (line.startsWith("SEVERITY:")) {
      const sev = line.substring(9).trim() as IssueSeverity;
      if (["error", "warning", "info", "suggestion"].includes(sev)) {
        severity = sev;
      }
    } else if (line.startsWith("SHORT:")) {
      shortDescription = line.substring(6).trim();
    } else if (line.startsWith("DESCRIPTION:")) {
      fullDescription = line.substring(12).trim();
    } else if (line.startsWith("SUGGESTION:")) {
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

  const combinedText = `${shortDescription} ${fullDescription} ${suggestion || ""}`.toLowerCase();
  if (noActionPatterns.some(pattern => pattern.test(combinedText))) {
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
 * Parse issues from JSON format
 * Expected format:
 * {
 *   "issues": [
 *     {
 *       "file": "path/to/file.ts",
 *       "lineStart": 10,
 *       "lineEnd": 15,
 *       "severity": "error",
 *       "shortDescription": "Variable 'x' is never used",
 *       "fullDescription": "The variable 'x' is declared but never used",
 *       "suggestion": "Remove the unused variable"
 *     }
 *   ]
 * }
 */
export function parseIssuesFromJSON(output: string, agentId: string, agentName: string): Issue[] {
  try {
    const data = JSON.parse(output);
    
    if (!data.issues || !Array.isArray(data.issues)) {
      return [];
    }

    return data.issues.map((item: any) => ({
      file: item.file || "",
      lineStart: item.lineStart || item.line || 0,
      lineEnd: item.lineEnd || item.lineStart || item.line || 0,
      severity: (item.severity || "info") as IssueSeverity,
      shortDescription: item.shortDescription || item.short || item.message || "",
      fullDescription: item.fullDescription || item.description || item.shortDescription || "",
      suggestion: item.suggestion,
      agentId,
      agentName,
    })).filter((issue: Issue) => issue.file && issue.shortDescription && issue.lineStart > 0);
  } catch {
    return [];
  }
}

/**
 * Try to parse issues from any format
 */
export function parseIssuesAuto(output: string, agentId: string, agentName: string): Issue[] {
  // Try JSON first
  if (output.trim().startsWith("{") || output.trim().startsWith("[")) {
    const jsonIssues = parseIssuesFromJSON(output, agentId, agentName);
    if (jsonIssues.length > 0) {
      return jsonIssues;
    }
  }

  // Try structured format
  return parseIssues(output, agentId, agentName);
}

