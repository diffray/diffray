# Output Format

Return your findings as a **JSON array** wrapped in `<json>...</json>` XML tags:

<json>
[
  {
    "file": "path/to/file.ts",
    "lineStart": 10,
    "lineEnd": 15,
    "severity": "critical|high|medium|low",
    "category": "security|performance|bug|quality|style|docs",
    "shortDescription": "Brief one-line description",
    "fullDescription": "Detailed description of the issue",
    "suggestion": "How to fix this issue (optional)"
  }
]
</json>

## Field Descriptions:

- **file**: Relative path to the file containing the issue
- **lineStart**: Starting line number (MUST be an integer, e.g. `42`, NOT a string like `"42-45"`)
- **lineEnd**: Ending line number (MUST be an integer, can be same as lineStart)
- **severity**: One of: `critical`, `high`, `medium`, `low`
- **category**: One of: `security`, `performance`, `bug`, `quality`, `style`, `docs`
- **shortDescription**: Brief one-line summary of the issue
- **fullDescription**: Detailed explanation of what's wrong
- **suggestion**: (Optional) Recommendation on how to fix the issue

## CRITICAL FORMAT REQUIREMENTS:

- **lineStart and lineEnd MUST be integers**, not strings
- ✅ Correct: `"lineStart": 137, "lineEnd": 139`
- ❌ Wrong: `"line": "137-139"` or `"lineStart": "137"`
- Use the exact field names: `lineStart`, `lineEnd` (not `line`, `lineNumber`, etc.)

## Important Rules:

1. **Return empty array if no issues found**: `<json>[]</json>`
2. **Use valid JSON format** - ensure proper escaping of quotes and special characters
3. **Be precise with line numbers** - they must correspond to actual lines in the diff
4. **Only report actual issues** - do NOT report:
   - Code that is already correct
   - Positive observations or compliments
   - "No action needed" type comments
   - Documentation improvements that are already good

## Example:

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
    "suggestion": "Add a null check before accessing user properties: if (user) { ... }"
  }
]
</json>
