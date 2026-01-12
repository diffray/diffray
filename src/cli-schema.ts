import { z } from 'zod';
import type { IssueSeverity } from './types';

/**
 * Valid severity levels for filtering
 */
const VALID_SEVERITIES: IssueSeverity[] = ['critical', 'high', 'medium', 'low'];

/**
 * Reusable schema for comma-separated list parsing
 */
const commaSeparatedList = z
  .string()
  .optional()
  .transform((val) => {
    if (!val) return undefined;
    return val.split(',').map((s) => s.trim());
  });

/**
 * Schema for review command CLI arguments
 * Validates user input with clear error messages
 */
export const ReviewArgsSchema = z.object({
  // Numeric validation
  confidence: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val) return true;
        const parsed = parseInt(val, 10);
        // Reject decimals (e.g., "80.5" parses to 80 but original string contains ".")
        return !isNaN(parsed) && !val.includes('.');
      },
      (val) => ({
        message: `Invalid confidence value: "${val}". Must be a number between 0-100.`,
      })
    )
    .transform((val) => {
      if (!val) return undefined;
      return parseInt(val, 10);
    })
    .refine(
      (val) => {
        if (val === undefined) return true;
        return val >= 0 && val <= 100;
      },
      (val) => ({
        message: `Invalid confidence value: ${val}. Must be between 0-100 (got ${val}).`,
      })
    ),

  // Severity validation
  severity: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val) return true;
        const values = val.split(',').map((s) => s.trim());
        const invalid = values.filter((v) => !VALID_SEVERITIES.includes(v as IssueSeverity));
        return invalid.length === 0;
      },
      (val) => {
        if (!val) return { message: '' };
        const values = val.split(',').map((s) => s.trim());
        const invalid = values.filter((v) => !VALID_SEVERITIES.includes(v as IssueSeverity));
        return {
          message: `Invalid severity values: ${invalid.join(', ')}. Must be one of: ${VALID_SEVERITIES.join(', ')}`,
        };
      }
    )
    .transform((val) => {
      if (!val) return undefined;
      return val.split(',').map((s) => s.trim()) as IssueSeverity[];
    }),

  // List-based string arguments (comma-separated)
  agent: commaSeparatedList,
  'exclude-agent': commaSeparatedList,
  rule: commaSeparatedList,
  'exclude-rule': commaSeparatedList,

  // String arguments
  base: z.string().optional(),
  head: z.string().optional(),
  branch: z.string().optional(),
  executor: z.string().optional(),

  // Boolean flags
  stream: z.boolean().optional(),
  verbose: z.boolean().optional(),
  json: z.boolean().optional(),
  'skip-validation': z.boolean().optional(),
});

export type ReviewArgs = z.infer<typeof ReviewArgsSchema>;

/**
 * Validate review command arguments
 * @param args - Raw CLI arguments
 * @returns Validated arguments
 * @throws Error with clear message if validation fails
 */
export function validateReviewArgs(args: Record<string, unknown>): ReviewArgs {
  return ReviewArgsSchema.parse(args);
}
