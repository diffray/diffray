---
name: code-bugs
description: Bug detection for code files
patterns:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
  - "**/*.py"
  - "**/*.go"
  - "**/*.rs"
  - "**/*.java"
  - "**/*.rb"
  - "**/*.php"
agent: bug-hunter
---

Review code changes for:
1. Potential bugs or logic errors
2. Edge cases and error handling
3. Resource leaks or memory issues
4. Race conditions or concurrency bugs
5. Null/undefined access

Be concise and actionable.

IMPORTANT: Only report actual issues that need fixing. Do NOT report:
- Documentation improvements that are already good
- Code that is already correct
- Positive observations or compliments
- "No action needed" type comments
