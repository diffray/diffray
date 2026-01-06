# Issues System

## Overview

The Issues system provides structured representation of code problems found by agents. Each issue contains:

- **File location** - which file has the issue
- **Line range** - start and end line numbers
- **Severity** - error, warning, info, or suggestion
- **Descriptions** - short and full descriptions
- **Suggestion** - how to fix the issue
- **Agent info** - which agent found it

## Issue Structure

```typescript
interface Issue {
  file: string;              // File path (e.g., "src/example.ts")
  lineStart: number;         // Starting line number
  lineEnd: number;           // Ending line number
  severity: IssueSeverity;   // "error" | "warning" | "info" | "suggestion"
  shortDescription: string;  // Brief one-line description
  fullDescription: string;   // Detailed explanation
  suggestion?: string;       // How to fix it (optional)
  agentId: string;          // Agent ID that found the issue
  agentName: string;        // Agent name for display
}
```

## Severity Levels

| Severity | Icon | Color | Description |
|----------|------|-------|-------------|
| `error` | ❌ | Red | Critical issues that must be fixed (bugs, security vulnerabilities) |
| `warning` | ⚠️ | Yellow | Important issues that should be addressed (potential bugs, bad practices) |
| `info` | ℹ️ | Blue | Informational messages (code quality, style suggestions) |
| `suggestion` | 💡 | Cyan | Optional improvements (refactoring, optimization) |

## Output Formats

Agents can return issues in two formats:

### 1. Structured Format

```
FILE: src/example.ts
LINES: 10-15
SEVERITY: error
SHORT: Variable 'x' is never used
DESCRIPTION: The variable 'x' is declared but never used in the function
SUGGESTION: Remove the unused variable or use it in the function body
---
FILE: src/utils.ts
LINES: 25
SEVERITY: warning
SHORT: Missing error handling
DESCRIPTION: The async function does not handle potential errors
SUGGESTION: Add try-catch block or .catch() handler
---
```

**Format Rules:**
- Each issue separated by `---`
- Fields: `FILE:`, `LINES:`, `SEVERITY:`, `SHORT:`, `DESCRIPTION:`, `SUGGESTION:`
- `LINES:` can be single line (`25`) or range (`10-15`)
- `SUGGESTION:` is optional

### 2. JSON Format

```json
{
  "issues": [
    {
      "file": "src/example.ts",
      "lineStart": 10,
      "lineEnd": 15,
      "severity": "error",
      "shortDescription": "Variable 'x' is never used",
      "fullDescription": "The variable 'x' is declared but never used",
      "suggestion": "Remove the unused variable"
    }
  ]
}
```

**JSON Fields:**
- `file` (required) - file path
- `lineStart` (required) - starting line
- `lineEnd` (optional) - ending line, defaults to lineStart
- `severity` (optional) - defaults to "info"
- `shortDescription` or `short` or `message` (required)
- `fullDescription` or `description` (optional)
- `suggestion` (optional)

## Agent Prompt Example

```
You are a code reviewer. Analyze the code changes and return issues in this format:

For each issue found, output:
FILE: <file path>
LINES: <start line>-<end line>
SEVERITY: error|warning|info|suggestion
SHORT: <brief one-line description>
DESCRIPTION: <detailed explanation>
SUGGESTION: <how to fix it>
---

Focus on:
1. Bugs and logic errors (severity: error)
2. Code quality issues (severity: warning)
3. Best practices (severity: info)
4. Optimizations (severity: suggestion)

Be specific about line numbers and provide actionable suggestions.
```

## Display

Issues are displayed grouped by file:

```
📋 Found 3 issue(s) in 2 file(s)

📄 src/example.ts (2 issue(s))

❌ ERROR
src/example.ts:10-15

Variable 'x' is never used

The variable 'x' is declared but never used in the function.

💡 Suggestion:
Remove the unused variable or use it in the function body.

From: Code Review
────────────────────────────────────────────────────────────────────────────────

⚠️ WARNING
src/example.ts:25

Missing error handling

The async function does not handle potential errors.

💡 Suggestion:
Add try-catch block or .catch() handler.

From: Code Review
────────────────────────────────────────────────────────────────────────────────
```

## Statistics

Pipeline completion shows issue statistics:

```
✅ Pipeline completed successfully in 109ms
📊 3/3 agents succeeded
📊 3 issue(s): 1 error(s), 1 warning(s), 1 suggestion(s)
```

## API

### Parsing

```typescript
import { parseIssues, parseIssuesFromJSON, parseIssuesAuto } from "./issue-parser";

// Parse structured format
const issues = parseIssues(output, agentId, agentName);

// Parse JSON format
const issues = parseIssuesFromJSON(jsonOutput, agentId, agentName);

// Auto-detect format
const issues = parseIssuesAuto(output, agentId, agentName);
```

### Formatting

```typescript
import { formatIssue, formatIssues, formatIssuesByFile } from "./issue-formatter";

// Format single issue
const formatted = formatIssue(issue, compact);

// Format all issues
const formatted = formatIssues(issues, compact);

// Format grouped by file
const formatted = formatIssuesByFile(issues);
```

