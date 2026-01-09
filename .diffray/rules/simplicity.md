---
name: simplicity
description: Enforce DRY and KISS principles
patterns:
  - "src/**/*.ts"
  - "bin/**/*.ts"
agent: general
---

Flag violations of DRY (Don't Repeat Yourself) and KISS (Keep It Simple).

## Red flags
- **DRY**: Duplicate logic across files, copy-pasted code
- **KISS**: Abstractions with single implementation (Factory, Registry, Builder)
- **KISS**: Wrapper functions/classes that just delegate
- **KISS**: Files >300 lines mixing concerns
- **KISS**: Vague names: `manager`, `handler`, `utils`

## Ignore
- Complexity required by external APIs
- Abstractions with multiple implementations

Suggest simpler alternative when flagging.
