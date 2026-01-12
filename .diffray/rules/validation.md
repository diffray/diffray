---
name: input-validation
description: Ensure all input validation uses Zod schemas instead of manual checks
patterns:
  - src/**/*.ts
  - bin/**/*.ts
agent: general
---

# Input Validation with Zod

All input validation must use Zod schemas for type safety and consistency.

## Rules

### ❌ Avoid manual validation:
- Manual `parseInt`, `parseFloat`, `isNaN` checks
- String splitting with manual array validation
- Custom error throwing for validation
- Inline boundary checks (e.g., `if (val < 0 || val > 100)`)

### ✅ Use Zod schemas instead:
- `.coerce.number()` for automatic number parsing
- `.transform()` for custom transformations
- `.refine()` for validation with clear error messages
- Centralized schemas in separate files (e.g., `*-schema.ts`)

## Example

See `src/cli-schema.ts` for proper Zod validation patterns:

```typescript
// ❌ Bad: Manual validation
let confidence: number | undefined;
if (args.confidence) {
  const parsed = parseInt(args.confidence, 10);
  if (isNaN(parsed)) {
    throw new Error('Invalid number');
  }
  if (parsed < 0 || parsed > 100) {
    throw new Error('Out of range');
  }
  confidence = parsed;
}

// ✅ Good: Zod schema
const ArgsSchema = z.object({
  confidence: z
    .string()
    .optional()
    .refine(
      (val) => !val || (!isNaN(parseInt(val, 10)) && !val.includes('.')),
      (val) => ({ message: `Invalid confidence value: "${val}"` })
    )
    .transform((val) => (val ? parseInt(val, 10) : undefined))
    .refine(
      (val) => val === undefined || (val >= 0 && val <= 100),
      (val) => ({ message: `Out of range: ${val}` })
    ),
});

const validated = ArgsSchema.parse(args);
```

## Benefits

- **Type safety**: TypeScript knows exact types after validation
- **Consistency**: Same validation approach across the codebase
- **Testability**: Easy to test validation logic
- **Maintainability**: Schemas are easy to extend and modify
- **Better errors**: Clear, consistent error messages

## When to flag

Flag code that:
- Uses manual `parseInt` / `parseFloat` / `isNaN` for user input
- Has inline validation logic that could be a Zod schema
- Throws custom errors for validation instead of using Zod
- Validates CLI args, API inputs, or config without Zod

## When NOT to flag

Don't flag:
- Existing Zod schemas that are properly implemented
- Internal calculations (not user input validation)
- Simple type checks without validation logic
- Legacy code unless being modified
