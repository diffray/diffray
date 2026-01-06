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
      systemPrompt: `Return your findings in this format:

FILE: <filename>
LINES: <start>-<end>
SEVERITY: error|warning|info|suggestion
SHORT: <one-line description>
FULL: <detailed description>
SUGGESTION: <how to fix>

---

Repeat for each issue found.`,
      enabled: true,
      order: 1,
      executorId: "auggie-cli", // Default executor
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
      executorId: "auggie-cli", // Default executor
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
      executorId: "auggie-cli", // Default executor
    },
  ];
}
