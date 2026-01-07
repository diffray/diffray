# Issues System

## Overview

The Issues system provides structured representation of code problems found by agents. Each issue contains:

- **File location** - which file has the issue
- **Line range** - start and end line numbers
- **Severity** - critical, high, medium, or low
- **Category** - security, performance, bug, quality, style, or docs
- **Descriptions** - short and full descriptions
- **Suggestion** - how to fix the issue
- **Agent info** - which agent found it

## Issue Structure

```typescript
interface Issue {
  file: string;              // File path (e.g., "src/example.ts")
  lineStart: number;         // Starting line number
  lineEnd: number;           // Ending line number
  severity: IssueSeverity;   // "critical" | "high" | "medium" | "low"
  category: IssueCategory;   // "security" | "performance" | "bug" | "quality" | "style" | "docs"
  shortDescription: string;  // Brief one-line description
  fullDescription: string;   // Detailed explanation
  suggestion?: string;       // How to fix it (optional)
  agent: string;             // Agent name that found the issue
}
```

## Severity Levels

| Severity | Icon | Color | Description |
|----------|------|-------|-------------|
| `critical` | ✗ | Red | Critical issues that must be fixed immediately |
| `high` | ⚠ | Yellow | Important issues that should be addressed soon |
| `medium` | ○ | Blue | Moderate issues worth reviewing |
| `low` | ◇ | Cyan | Minor issues or suggestions |

## Categories

| Category | Icon | Description |
|----------|------|-------------|
| `security` | 🔒 | Security vulnerabilities and risks |
| `performance` | ⚡ | Performance issues and optimizations |
| `bug` | 🐛 | Bugs and logic errors |
| `quality` | ✨ | Code quality issues |
| `style` | 🎨 | Style and formatting issues |
| `docs` | 📝 | Documentation issues |

## Output Formats

Agents can return issues in two formats:

### JSON Format

```json
[
  {
    "file": "src/example.ts",
    "lineStart": 10,
    "lineEnd": 15,
    "severity": "high",
    "category": "bug",
    "shortDescription": "Variable 'x' is never used",
    "fullDescription": "The variable 'x' is declared but never used",
    "suggestion": "Remove the unused variable"
  },
  {
    "file": "src/utils.ts",
    "lineStart": 25,
    "lineEnd": 25,
    "severity": "medium",
    "category": "quality",
    "shortDescription": "Missing error handling",
    "fullDescription": "The async function does not handle potential errors",
    "suggestion": "Add try-catch block or .catch() handler"
  }
]
```

**JSON Fields:**
- `file` (required) - file path
- `lineStart` (required) - starting line
- `lineEnd` (optional) - ending line, defaults to lineStart
- `severity` (optional) - defaults to "medium"
- `category` (optional) - defaults to "quality"
- `shortDescription` or `short` or `message` (required)
- `fullDescription` or `description` (optional)
- `suggestion` (optional)

## Agent Prompt Example

Agents should return issues in JSON format. See `src/defaults/prompts/output-format.md` for the complete output format specification.

**Severity guidelines:**
- `critical` - Security vulnerabilities, data loss risks
- `high` - Bugs, logic errors, potential crashes
- `medium` - Code quality issues, bad practices
- `low` - Minor improvements, style suggestions

**Category guidelines:**
- `security` - Security vulnerabilities
- `performance` - Performance issues
- `bug` - Bugs and logic errors
- `quality` - Code quality issues
- `style` - Style and formatting
- `docs` - Documentation issues

## Display

Issues are displayed grouped by file:

```
Found 3 issue(s) in 2 file(s)

src/example.ts (2 issue(s))

✗ HIGH 🐛 bug
src/example.ts:10-15

Variable 'x' is never used

The variable 'x' is declared but never used in the function.

→ Suggestion:
Remove the unused variable or use it in the function body.

From: bug-hunter
────────────────────────────────────────────────────────────────────────────────

○ MEDIUM ✨ quality
src/example.ts:25

Missing error handling

The async function does not handle potential errors.

→ Suggestion:
Add try-catch block or .catch() handler.

From: bug-hunter
────────────────────────────────────────────────────────────────────────────────
```

## Statistics

Pipeline completion shows issue statistics:

```
✓ Pipeline completed successfully in 109ms
■ 3/3 agents succeeded
■ 3 issue(s): 1 critical, 1 high, 1 medium
```

## API

### Parsing

```typescript
import { parseIssues } from "./issue-parser";

// Parse JSON output from agent
const issues = parseIssues(output, agentName);
```

### Formatting

```typescript
import { formatIssue, formatIssues, formatIssuesByFile } from "./issue-formatter";

// Format single issue
const formatted = formatIssue(issue, compact);

// Format all issues
const formatted = formatIssues(issues, compact);

// Format grouped by file (used for CLI output)
const formatted = formatIssuesByFile(issues);
```

