/**
 * Default SubAgents - default task configurations
 */

import type { SubAgent } from "../types";

/**
 * Get default SubAgents
 */
export function getDefaultSubAgents(): SubAgent[] {
  return [
    {
      id: "code-review",
      name: "Code Review",
      description: "Reviews code changes for potential issues",
      systemPrompt: `You are a code review assistant. Analyze the provided code changes and identify potential issues, bugs, or improvements.

Return your findings as a JSON array with this structure:
[
  {
    "file": "path/to/file.ts",
    "lineStart": 10,
    "lineEnd": 15,
    "severity": "error|warning|info|suggestion",
    "shortDescription": "Brief description",
    "fullDescription": "Detailed description",
    "suggestion": "How to fix (optional)"
  }
]

If no issues found, return an empty array: []`,
      enabled: true,
      order: 1,
      executorId: "claude-cli", // Use Claude Code CLI
    },
    {
      id: "security-scan",
      name: "Security Scanner",
      description: "Scans for security vulnerabilities",
      systemPrompt: `Return your findings in this format:

FILE: <filename>
LINES: <start>-<end>
SEVERITY: error|warning|info|suggestion
SHORT: <one-line description>
FULL: <detailed description>
SUGGESTION: <how to fix>

---

Repeat for each issue found.`,
      enabled: false, // Disabled - not passing
      order: 2,
      executorId: "default-cli", // Default stub executor for testing
    },
    {
      id: "performance-check",
      name: "Performance Checker",
      description: "Checks for performance issues",
      systemPrompt: `Return your findings in this format:

FILE: <filename>
LINES: <start>-<end>
SEVERITY: error|warning|info|suggestion
SHORT: <one-line description>
FULL: <detailed description>
SUGGESTION: <how to fix>

---

Repeat for each issue found.`,
      enabled: false,
      order: 3,
      executorId: "default-cli", // Default stub executor for testing
    },
  ];
}
