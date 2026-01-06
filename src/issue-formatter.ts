/**
 * Format issues for display
 */

import type { Issue, IssueSeverity } from "./types";

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  gray: "\x1b[90m",
};

/**
 * Get color for severity
 */
function getSeverityColor(severity: IssueSeverity): string {
  switch (severity) {
    case "error":
      return colors.red;
    case "warning":
      return colors.yellow;
    case "info":
      return colors.blue;
    case "suggestion":
      return colors.cyan;
  }
}

/**
 * Get icon for severity
 */
function getSeverityIcon(severity: IssueSeverity): string {
  switch (severity) {
    case "error":
      return "❌";
    case "warning":
      return "⚠️";
    case "info":
      return "ℹ️";
    case "suggestion":
      return "💡";
  }
}

/**
 * Format a single issue
 */
export function formatIssue(issue: Issue, compact = false): string {
  const color = getSeverityColor(issue.severity);
  const icon = getSeverityIcon(issue.severity);
  const output: string[] = [];

  if (compact) {
    // Compact format: file:line - short description
    output.push(
      `${icon} ${colors.bold}${issue.file}:${issue.lineStart}${colors.reset} - ${color}${issue.shortDescription}${colors.reset}`
    );
  } else {
    // Full format with all details
    output.push("");
    output.push(`${icon} ${color}${colors.bold}${issue.severity.toUpperCase()}${colors.reset}`);
    output.push(`${colors.bold}${issue.file}${colors.reset}:${colors.cyan}${issue.lineStart}${issue.lineEnd !== issue.lineStart ? `-${issue.lineEnd}` : ""}${colors.reset}`);
    output.push("");
    output.push(`${colors.bold}${issue.shortDescription}${colors.reset}`);
    
    if (issue.fullDescription && issue.fullDescription !== issue.shortDescription) {
      output.push("");
      output.push(`${colors.dim}${issue.fullDescription}${colors.reset}`);
    }

    if (issue.suggestion) {
      output.push("");
      output.push(`${colors.green}💡 Suggestion:${colors.reset}`);
      output.push(`${colors.dim}${issue.suggestion}${colors.reset}`);
    }

    output.push("");
    output.push(`${colors.gray}From: ${issue.agentName}${colors.reset}`);
    output.push("");
    output.push(colors.gray + "─".repeat(80) + colors.reset);
  }

  return output.join("\n");
}

/**
 * Format multiple issues
 */
export function formatIssues(issues: Issue[], compact = false): string {
  if (issues.length === 0) {
    return `${colors.green}✅ No issues found${colors.reset}`;
  }

  const output: string[] = [];

  if (!compact) {
    output.push("");
    output.push(`${colors.bold}📋 Found ${issues.length} issue(s)${colors.reset}`);
    output.push("");
  }

  for (const issue of issues) {
    output.push(formatIssue(issue, compact));
  }

  return output.join("\n");
}

/**
 * Group issues by file
 */
export function groupIssuesByFile(issues: Issue[]): Map<string, Issue[]> {
  const grouped = new Map<string, Issue[]>();

  for (const issue of issues) {
    const existing = grouped.get(issue.file) || [];
    existing.push(issue);
    grouped.set(issue.file, existing);
  }

  return grouped;
}

/**
 * Format issues grouped by file
 */
export function formatIssuesByFile(issues: Issue[]): string {
  if (issues.length === 0) {
    return `${colors.green}✅ No issues found${colors.reset}`;
  }

  const grouped = groupIssuesByFile(issues);
  const output: string[] = [];

  output.push("");
  output.push(`${colors.bold}📋 Found ${issues.length} issue(s) in ${grouped.size} file(s)${colors.reset}`);
  output.push("");

  for (const [file, fileIssues] of grouped) {
    output.push(`${colors.bold}${colors.cyan}📄 ${file}${colors.reset} ${colors.dim}(${fileIssues.length} issue(s))${colors.reset}`);
    output.push("");

    for (const issue of fileIssues) {
      output.push(formatIssue(issue, false));
    }
  }

  return output.join("\n");
}

/**
 * Format pipeline result as JSON for machine consumption
 */
export interface JSONOutput {
  success: boolean;
  totalDuration: number;
  stats: {
    totalIssues: number;
    errors: number;
    warnings: number;
    info: number;
    suggestions: number;
    filesAnalyzed: number;
    agentsExecuted: number;
    agentsSucceeded: number;
    agentsFailed: number;
  };
  issues: Issue[];
  files: {
    file: string;
    issueCount: number;
    issues: Issue[];
  }[];
}

export function formatAsJSON(
  issues: Issue[],
  success: boolean,
  totalDuration: number,
  agentsExecuted: number,
  agentsSucceeded: number,
  filesAnalyzed: number
): string {
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const infoCount = issues.filter((i) => i.severity === "info").length;
  const suggestionCount = issues.filter((i) => i.severity === "suggestion").length;

  // Group issues by file
  const grouped = groupIssuesByFile(issues);
  const filesList = Array.from(grouped.entries()).map(([file, fileIssues]) => ({
    file,
    issueCount: fileIssues.length,
    issues: fileIssues,
  }));

  const output: JSONOutput = {
    success,
    totalDuration,
    stats: {
      totalIssues: issues.length,
      errors: errorCount,
      warnings: warningCount,
      info: infoCount,
      suggestions: suggestionCount,
      filesAnalyzed,
      agentsExecuted,
      agentsSucceeded,
      agentsFailed: agentsExecuted - agentsSucceeded,
    },
    issues,
    files: filesList,
  };

  return JSON.stringify(output, null, 2);
}

