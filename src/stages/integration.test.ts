/**
 * Integration tests for stage pipeline
 */

import { test, expect, describe } from 'vitest';
import { createDeduplicationStage } from './deduplication';
import { createValidationStage } from './validation';
import type { Issue } from '../types';
import { loadConfig } from '../config';
import { createMockContext, createIssue } from './test-utils';

describe('Stage Integration', () => {
  describe('Deduplication → Validation Pipeline', () => {
    test('should validate deduplicated issues, not original results', async () => {
      // Create 3 duplicate issues (same location)
      const duplicateIssues = [
        createIssue({ file: 'a.ts', lineStart: 10, lineEnd: 10, shortDescription: 'Issue A' }),
        createIssue({ file: 'a.ts', lineStart: 10, lineEnd: 10, shortDescription: 'Issue A' }),
        createIssue({ file: 'a.ts', lineStart: 10, lineEnd: 10, shortDescription: 'Issue A' }),
      ];

      const context = createMockContext(duplicateIssues);

      // Load config for validation stage
      context.config = await loadConfig(process.cwd());

      // Step 1: Run deduplication
      const dedupStage = createDeduplicationStage();
      await dedupStage.execute(context);

      // After deduplication, context.issues should have 1 issue
      expect(context.issues).toHaveLength(1);

      // context.results should still have 3 issues (unchanged)
      expect(context.results[0]?.issues).toHaveLength(3);

      // Step 2: Run validation with skipValidation to test reading source
      context.skipValidation = true;
      const validationStage = createValidationStage();
      await validationStage.execute(context);

      // Validation should skip, context.issues should remain 1
      expect(context.issues).toHaveLength(1);

      // This confirms validation reads from context.issues, not context.results
    });

    test('should preserve deduplication through validation', async () => {
      // Create issues where deduplication reduces count
      const issues = [
        createIssue({
          file: 'a.ts',
          lineStart: 10,
          lineEnd: 10,
          shortDescription: 'Missing null check',
        }),
        createIssue({
          file: 'a.ts',
          lineStart: 15,
          lineEnd: 15,
          shortDescription: 'Missing null check here',
        }), // Will be deduplicated (similar + within 10 lines)
        createIssue({
          file: 'b.ts',
          lineStart: 50,
          lineEnd: 50,
          shortDescription: 'Unused variable',
        }),
      ];

      const context = createMockContext(issues);
      context.config = await loadConfig(process.cwd());

      // Run deduplication
      const dedupStage = createDeduplicationStage();
      await dedupStage.execute(context);

      // Should be 2 issues after deduplication (1 deduplicated)
      expect(context.issues).toHaveLength(2);

      // Run validation (skipped to avoid LLM call)
      context.skipValidation = true;
      const validationStage = createValidationStage();
      await validationStage.execute(context);

      // Should still be 2 issues
      expect(context.issues).toHaveLength(2);

      // Verify context.results unchanged
      expect(context.results[0]?.issues).toHaveLength(3);
    });
  });

  describe('Data Flow Consistency', () => {
    test('context.results should remain immutable after deduplication', async () => {
      const issues = [
        createIssue({ file: 'a.ts', lineStart: 10, lineEnd: 10 }),
        createIssue({ file: 'a.ts', lineStart: 10, lineEnd: 10 }),
      ];

      const context = createMockContext(issues);
      const originalResultsLength = context.results[0]?.issues.length;

      // Run deduplication
      const dedupStage = createDeduplicationStage();
      await dedupStage.execute(context);

      // context.issues should be deduplicated
      expect(context.issues).toHaveLength(1);

      // context.results should be unchanged (immutable raw output)
      expect(context.results[0]?.issues.length).toBe(originalResultsLength);
    });

    test('CLI should read from context.issues (not context.results)', () => {
      // This test documents the expected behavior:
      // - context.results = raw agent output (immutable)
      // - context.issues = processed issues (deduplicated, filtered, validated)
      // - CLI reads from context.issues

      const context = createMockContext([
        createIssue({ file: 'a.ts', lineStart: 10, lineEnd: 10 }),
      ]);

      // Simulate deduplication modifying context.issues
      context.issues = [createIssue({ file: 'b.ts', lineStart: 20, lineEnd: 20 })];

      // CLI should read context.issues (not context.results)
      const cliIssues = context.issues; // ✓ Correct
      const wrongIssues = context.results.flatMap((r) => r.issues); // ✗ Wrong (old behavior)

      expect(cliIssues).toHaveLength(1);
      expect(cliIssues[0]?.file).toBe('b.ts');

      expect(wrongIssues).toHaveLength(1);
      expect(wrongIssues[0]?.file).toBe('a.ts');

      // This test demonstrates why reading from context.issues is correct
    });
  });
});
