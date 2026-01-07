---
id: "typescript-security"
name: "TypeScript Security"
description: "Security scan for TypeScript files"
patterns: ["**/*.ts", "**/*.tsx"]
agent: "security-scan"
---

Scan TypeScript code for security vulnerabilities:
1. Authentication/authorization issues
2. Input validation problems
3. SQL injection risks
4. XSS vulnerabilities
5. Sensitive data exposure

Only report actual security concerns. Do NOT report positive observations or "no issues found" messages.