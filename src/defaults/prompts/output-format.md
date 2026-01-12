# Output Format

Return your findings as a **JSON array** wrapped in `<json>...</json>` XML tags:

<json>
[
  {
    "file": "path/to/file.ts",
    "lineStart": 42,
    "lineEnd": 45,
    "severity": "critical|high|medium|low",
    "category": "security|performance|bug|quality|style|docs",
    "shortDescription": "Brief one-line title (max 60 chars)",
    "fullDescription": "Detailed explanation (1-2 phrases)",
    "suggestion": "How to fix this issue",
    "rule": "rule-name-from-file-rule-mappings",
    "evidence": "The actual code snippet that proves the issue exists",
    "confidence": 90
  }
]
</json>

## Field Descriptions

- **file**: Relative path from repository root
- **lineStart, lineEnd**: Line numbers (MUST be integers, not strings)
- **severity**: Impact level
  - `critical`: Security vulnerabilities, data loss, crashes
  - `high`: Bugs, significant performance issues
  - `medium`: Code quality, maintainability concerns
  - `low`: Minor style, documentation improvements
- **category**: Type of issue
  - `security`: SQL injection, XSS, auth bypass, secrets exposure
  - `performance`: O(n^2) algorithms, memory leaks, blocking operations
  - `bug`: Logic errors, incorrect behavior, edge cases
  - `quality`: Code smells, duplicated code, complex functions
  - `style`: Formatting, naming conventions, inconsistencies
  - `docs`: Missing or incorrect documentation
- **shortDescription**: Brief title (max 60 chars)
- **fullDescription**: Concise explanation (1-2 phrases)
- **suggestion**: Actionable fix recommendation (optional)
- **rule**: The rule name from File-Rule Mappings section (REQUIRED if mappings provided)
- **evidence**: The actual code that proves the issue exists (REQUIRED)
- **confidence**: Certainty level 0-100 (REQUIRED, only report issues with confidence >= 80)

## Quality Standards

- **Only report issues with confidence >= 80%**
- Every finding MUST have concrete evidence from the actual code
- Skip theoretical, speculative, or "might be" issues
- Focus on issues that would actually cause problems in production

## Critical Format Requirements

- **lineStart and lineEnd MUST be integers**, not strings
- Correct: `"lineStart": 137, "lineEnd": 139`
- Wrong: `"line": "137-139"` or `"lineStart": "137"`

## Important Rules

1. **Return empty array if no issues found**: `<json>[]</json>`
2. **Use valid JSON format** - ensure proper escaping of quotes and special characters
3. **Be precise with line numbers** - they must correspond to actual lines in the diff
4. **Only report actual issues** - do NOT report:
   - Code that is already correct
   - Positive observations or compliments
   - "No action needed" type comments
   - Theoretical issues without concrete evidence

## Example

Given File-Rule Mappings:
- src/utils/validator.ts: rule="input-validation"

<json>
[
  {
    "file": "src/utils/validator.ts",
    "lineStart": 42,
    "lineEnd": 45,
    "severity": "high",
    "category": "bug",
    "shortDescription": "Potential null pointer dereference",
    "fullDescription": "The 'user' object may be null at this point, but is accessed without a null check. This will cause a runtime error if user is null.",
    "suggestion": "Add a null check before accessing user properties: if (user) { ... }",
    "rule": "input-validation",
    "evidence": "Line 43: const name = user.name; // user can be null from getUserById()",
    "confidence": 95
  }
]
</json>
