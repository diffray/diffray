---
name: code-general
description: General code quality review for all source files
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
  - "**/*.c"
  - "**/*.cpp"
  - "**/*.h"
  - "**/*.cs"
  - "**/*.swift"
  - "**/*.kt"
  - "**/*.scala"
agent: general
---

Perform a general code quality review. Focus on:

1. **Readability** - Is the code easy to understand?
2. **Simplicity** - Is there unnecessary complexity or over-engineering?
3. **Naming** - Are variables, functions, and classes named clearly?
4. **Structure** - Is the code organized logically? Are functions doing too much?
5. **Dependencies** - Are there hidden or circular dependencies?
6. **DRY violations** - Is there obvious code duplication?
7. **API design** - Are interfaces intuitive and consistent?

Do NOT review (covered by other agents):
- Bugs, logic errors, edge cases → bug-hunter
- Security vulnerabilities → security-scan
- Performance issues → performance-check

Be direct and actionable. Only report issues that genuinely need attention.

IMPORTANT: Do NOT report:
- Code that is already good
- Minor style preferences
- Compliments or positive observations
- Suggestions for hypothetical future improvements
