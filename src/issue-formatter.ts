/**
 * Format issues for display
 */

import type { Issue, IssueSeverity, IssueCategory } from './types';

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  gray: '\x1b[90m',
};

/**
 * Get color for severity
 */
function getSeverityColor(severity: IssueSeverity): string {
  switch (severity) {
    case 'critical':
      return colors.red;
    case 'high':
      return colors.yellow;
    case 'medium':
      return colors.blue;
    case 'low':
      return colors.cyan;
  }
}

/**
 * Get icon for severity
 */
function getSeverityIcon(severity: IssueSeverity): string {
  switch (severity) {
    case 'critical':
      return '✗';
    case 'high':
      return '⚠';
    case 'medium':
      return '○';
    case 'low':
      return '◇';
  }
}

/**
 * Get icon for category
 */
function getCategoryIcon(category: IssueCategory): string {
  switch (category) {
    case 'security':
      return '🔒';
    case 'performance':
      return '⚡';
    case 'bug':
      return '🐛';
    case 'quality':
      return '✨';
    case 'style':
      return '🎨';
    case 'docs':
      return '📝';
  }
}

/**
 * Get severity priority for sorting
 */
function getSeverityPriority(severity: IssueSeverity): number {
  switch (severity) {
    case 'critical':
      return 0;
    case 'high':
      return 1;
    case 'medium':
      return 2;
    case 'low':
      return 3;
  }
}

/**
 * Sort issues by severity priority
 */
export function sortIssuesBySeverity(issues: Issue[]): Issue[] {
  return [...issues].sort((a, b) => {
    const priorityA = getSeverityPriority(a.severity);
    const priorityB = getSeverityPriority(b.severity);
    return priorityA - priorityB;
  });
}

/**
 * Format a single issue
 */
export function formatIssue(issue: Issue, compact = false): string {
  const color = getSeverityColor(issue.severity);
  const icon = getSeverityIcon(issue.severity);
  const categoryIcon = getCategoryIcon(issue.category);
  const output: string[] = [];

  if (compact) {
    // Compact format: file:line - short description
    output.push(
      `${icon} ${colors.bold}${issue.file}:${issue.lineStart}${colors.reset} - ${color}${issue.shortDescription}${colors.reset}`
    );
  } else {
    // Full format with all details
    output.push('');
    output.push(
      `${icon} ${color}${colors.bold}${issue.severity.toUpperCase()}${colors.reset} ${categoryIcon} ${colors.dim}${issue.category}${colors.reset}`
    );
    output.push(
      `${colors.bold}${issue.file}${colors.reset}:${colors.cyan}${issue.lineStart}${issue.lineEnd !== issue.lineStart ? `-${issue.lineEnd}` : ''}${colors.reset}`
    );
    output.push('');
    output.push(`${colors.bold}${issue.shortDescription}${colors.reset}`);

    if (issue.fullDescription && issue.fullDescription !== issue.shortDescription) {
      output.push('');
      output.push(`${colors.dim}${issue.fullDescription}${colors.reset}`);
    }

    if (issue.suggestion) {
      output.push('');
      output.push(`${colors.green}→ Suggestion:${colors.reset}`);
      output.push(`${colors.dim}${issue.suggestion}${colors.reset}`);
    }

    output.push('');
    output.push(`${colors.gray}From: ${issue.agent}${colors.reset}`);
    output.push('');
    output.push(colors.gray + '─'.repeat(80) + colors.reset);
  }

  return output.join('\n');
}

/**
 * Format multiple issues
 */
export function formatIssues(issues: Issue[], compact = false): string {
  if (issues.length === 0) {
    return `${colors.green}✓ No issues found 🎉${colors.reset}`;
  }

  const output: string[] = [];

  if (!compact) {
    output.push('');
    output.push(`${colors.bold}Found ${issues.length} issue(s)${colors.reset}`);
    output.push('');
  }

  for (const issue of issues) {
    output.push(formatIssue(issue, compact));
  }

  return output.join('\n');
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
 * Get minimum severity priority for a group of issues (lower = more severe)
 */
function getMinSeverityPriority(issues: Issue[]): number {
  return Math.min(...issues.map((i) => getSeverityPriority(i.severity)));
}

/**
 * Format issues grouped by file, sorted by severity
 */
export function formatIssuesByFile(issues: Issue[]): string {
  if (issues.length === 0) {
    return `${colors.green}✓ No issues found 🎉${colors.reset}`;
  }

  const grouped = groupIssuesByFile(issues);
  const output: string[] = [];

  output.push('');
  output.push(
    `${colors.bold}Found ${issues.length} issue(s) in ${grouped.size} file(s)${colors.reset}`
  );
  output.push('');

  // Sort files by their most severe issue
  const sortedFiles = Array.from(grouped.entries()).sort(
    ([, issuesA], [, issuesB]) => getMinSeverityPriority(issuesA) - getMinSeverityPriority(issuesB)
  );

  for (const [file, fileIssues] of sortedFiles) {
    output.push(
      `${colors.bold}${colors.cyan}${file}${colors.reset} ${colors.dim}(${fileIssues.length} issue(s))${colors.reset}`
    );
    output.push('');

    const sortedFileIssues = sortIssuesBySeverity(fileIssues);
    for (const issue of sortedFileIssues) {
      output.push(formatIssue(issue, false));
    }
  }

  return output.join('\n');
}

/**
 * Format pipeline result as JSON for machine consumption
 */
export interface JSONOutput {
  success: boolean;
  totalDuration: number;
  stats: {
    totalIssues: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
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
  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const highCount = issues.filter((i) => i.severity === 'high').length;
  const mediumCount = issues.filter((i) => i.severity === 'medium').length;
  const lowCount = issues.filter((i) => i.severity === 'low').length;

  // Sort issues by severity
  const sortedIssues = sortIssuesBySeverity(issues);

  // Group issues by file
  const grouped = groupIssuesByFile(sortedIssues);
  const filesList = Array.from(grouped.entries()).map(([file, fileIssues]) => ({
    file,
    issueCount: fileIssues.length,
    issues: sortIssuesBySeverity(fileIssues),
  }));

  const output: JSONOutput = {
    success,
    totalDuration,
    stats: {
      totalIssues: issues.length,
      critical: criticalCount,
      high: highCount,
      medium: mediumCount,
      low: lowCount,
      filesAnalyzed,
      agentsExecuted,
      agentsSucceeded,
      agentsFailed: agentsExecuted - agentsSucceeded,
    },
    issues: sortedIssues,
    files: filesList,
  };

  return JSON.stringify(output, null, 2);
}
