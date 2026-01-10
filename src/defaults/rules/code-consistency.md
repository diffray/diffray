---
name: code-consistency
description: Consistency check for code files
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
  - "**/*.md"
  - "**/*.json"
  - "**/*.yaml"
  - "**/*.yml"
agent: consistency-check
---

Review code changes for inconsistencies with existing codebase patterns:

1. **Naming conventions** - Does new code follow established naming patterns?
   - Variable/function naming style (camelCase, snake_case, etc.)
   - Similar concepts should use similar names

2. **Code patterns** - Does new code use same patterns as existing code?
   - Async handling (async/await vs callbacks vs promises)
   - Error handling approach
   - Data fetching patterns
   - State management patterns

3. **API design** - Are new APIs consistent with existing ones?
   - Parameter ordering and naming
   - Return value structure
   - Error response format

4. **Import/export style** - Consistent module organization?
   - Import ordering and grouping
   - Default vs named exports

5. **Type definitions** - Consistent type patterns?
   - Interface vs type usage
   - Optional vs nullable patterns

6. **Documentation consistency** (for .md files)
   - Heading styles and hierarchy
   - Link formats and references
   - Code block language annotations
   - Section ordering and structure

7. **Config/JSON/YAML consistency** (for config files)
   - Key naming conventions (camelCase vs snake_case vs kebab-case)
   - Value formats (strings vs numbers, quotes usage)
   - Structure patterns (nesting depth, array vs object)
   - Comment styles (where applicable)

IMPORTANT: Only report inconsistencies that:
- Make the codebase harder to navigate
- Could lead to confusion or bugs
- Violate clearly established patterns

Do NOT report:
- Style preferences without established pattern
- Intentional deviations with clear purpose
- Minor variations that don't impact readability
