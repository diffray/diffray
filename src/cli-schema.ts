import { z } from 'zod';
import type { IssueSeverity } from './types';

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
        const validSeverities: IssueSeverity[] = ['critical', 'high', 'medium', 'low'];
        const values = val.split(',').map((s) => s.trim());
        const invalid = values.filter((v) => !validSeverities.includes(v as IssueSeverity));
        return invalid.length === 0;
      },
      (val) => {
        if (!val) return { message: '' };
        const validSeverities: IssueSeverity[] = ['critical', 'high', 'medium', 'low'];
        const values = val.split(',').map((s) => s.trim());
        const invalid = values.filter((v) => !validSeverities.includes(v as IssueSeverity));
        return {
          message: `Invalid severity values: ${invalid.join(', ')}. Must be one of: ${validSeverities.join(', ')}`,
        };
      }
    )
    .transform((val) => {
      if (!val) return undefined;
      return val.split(',').map((s) => s.trim()) as IssueSeverity[];
    }),

  // String arguments
  base: z.string().optional(),
  head: z.string().optional(),
  branch: z.string().optional(),
  agent: z.string().optional(),
  'exclude-agent': z.string().optional(),
  rule: z.string().optional(),
  'exclude-rule': z.string().optional(),
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
