---
name: code-security
description: Security scan for code files
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
agent: security-scan
---

Scan code for security vulnerabilities:
1. Authentication/authorization issues
2. Input validation problems
3. SQL injection risks
4. XSS vulnerabilities
5. Sensitive data exposure

Only report actual security concerns. Do NOT report positive observations or "no issues found" messages.
