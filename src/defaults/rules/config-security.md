---
id: "config-security"
name: "Config Security"
description: "Security scan for config files"
patterns: ["**/*.json", "**/*.yaml", "**/*.yml", "**/*.toml"]
agent: "security-scan"
---

Scan configuration files for security issues:
1. Hardcoded secrets or credentials
2. Insecure default settings
3. Exposed sensitive information
4. Dangerous permissions

Only report actual security risks. Do NOT report positive observations or "no issues found" messages.