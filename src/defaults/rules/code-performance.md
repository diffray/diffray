---
name: code-performance
description: Performance analysis for code files
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
agent: performance-check
---

Review code changes for:
1. Algorithm complexity (O(n^2) or worse)
2. N+1 queries and database inefficiencies
3. Memory leaks and excessive allocations
4. Missing caching opportunities
5. Blocking operations and missing parallelization

Be concise and actionable.

IMPORTANT: Only report actual performance issues. Do NOT report:
- Micro-optimizations with negligible impact
- Theoretical issues without real-world consequences
- Code that is already performant
