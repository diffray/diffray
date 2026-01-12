/**
 * Tests for deduplication stage
 */

import { test, expect, describe } from 'vitest';
import { createDeduplicationStage } from './deduplication';
import type { Issue } from '../types';
import { createMockContext, createIssue } from './test-utils';

describe('Deduplication Stage', () => {
  describe('Exact location deduplication', () => {
    test('should remove issues with identical file and line numbers', async () => {
      const stage = createDeduplicationStage();
      const context = createMockContext([
        createIssue({ file: 'a.ts', lineStart: 10, lineEnd: 15 }),
        createIssue({ file: 'a.ts', lineStart: 10, lineEnd: 15 }),
        createIssue({ file: 'a.ts', lineStart: 10, lineEnd: 15 }),
      ]);

      await stage.execute(context);

      expect(context.issues).toHaveLength(1);
      expect(context.issues[0]?.file).toBe('a.ts');
      expect(context.issues[0]?.lineStart).toBe(10);
    });

    test('should keep issues with different locations and descriptions', async () => {
      const stage = createDeduplicationStage();
      const context = createMockContext([
        createIssue({
          file: 'a.ts',
          lineStart: 10,
          lineEnd: 15,
          shortDescription: 'Missing authentication check',
        }),
        createIssue({
          file: 'a.ts',
          lineStart: 25,
          lineEnd: 30,
          shortDescription: 'Incorrect type annotation',
        }),
        createIssue({
          file: 'b.ts',
          lineStart: 10,
          lineEnd: 15,
          shortDescription: 'Unused variable declaration',
        }),
      ]);

      await stage.execute(context);

      expect(context.issues).toHaveLength(3);
    });
  });

  describe('Semantic deduplication with bucketing', () => {
    test('should detect similar issues within 10 lines (same bucket)', async () => {
      const stage = createDeduplicationStage();
      const context = createMockContext([
        createIssue({
          file: 'a.ts',
          lineStart: 10,
          lineEnd: 12,
          shortDescription: 'Missing error handling',
        }),
        createIssue({
          file: 'a.ts',
          lineStart: 15,
          lineEnd: 17,
          shortDescription: 'Missing error handling code',
        }),
      ]);

      await stage.execute(context);

      // Should be deduplicated (within 10 lines, similar description)
      expect(context.issues).toHaveLength(1);
    });

    test('should detect similar issues across bucket boundary', async () => {
      const stage = createDeduplicationStage();
      const context = createMockContext([
        createIssue({
          file: 'a.ts',
          lineStart: 19,
          lineEnd: 19,
          shortDescription: 'Missing null check',
        }),
        createIssue({
          file: 'a.ts',
          lineStart: 21,
          lineEnd: 21,
          shortDescription: 'Missing null check here',
        }),
      ]);

      await stage.execute(context);

      // Should be deduplicated (19 is in bucket 0, 21 is in bucket 1, but within 10 lines)
      expect(context.issues).toHaveLength(1);
    });

    test('should NOT deduplicate similar issues more than 10 lines apart', async () => {
      const stage = createDeduplicationStage();
      const context = createMockContext([
        createIssue({
          file: 'a.ts',
          lineStart: 10,
          lineEnd: 10,
          shortDescription: 'Missing error handling',
        }),
        createIssue({
          file: 'a.ts',
          lineStart: 25,
          lineEnd: 25,
          shortDescription: 'Missing error handling',
        }),
      ]);

      await stage.execute(context);

      // Should NOT be deduplicated (more than 10 lines apart)
      expect(context.issues).toHaveLength(2);
    });

    test('should NOT deduplicate issues in different files', async () => {
      const stage = createDeduplicationStage();
      const context = createMockContext([
        createIssue({
          file: 'a.ts',
          lineStart: 10,
          lineEnd: 10,
          shortDescription: 'Missing error handling',
        }),
        createIssue({
          file: 'b.ts',
          lineStart: 10,
          lineEnd: 10,
          shortDescription: 'Missing error handling',
        }),
      ]);

      await stage.execute(context);

      // Should NOT be deduplicated (different files)
      expect(context.issues).toHaveLength(2);
    });

    test('should handle large number of issues efficiently (bucketing performance)', async () => {
      const stage = createDeduplicationStage();

      // Create 1000 issues across 10 files, 100 per file
      // Space them 20 lines apart to avoid semantic deduplication
      const issues: Issue[] = [];
      for (let fileIdx = 0; fileIdx < 10; fileIdx++) {
        for (let line = 1; line <= 2000; line += 20) {
          issues.push(
            createIssue({
              file: `file${fileIdx}.ts`,
              lineStart: line,
              lineEnd: line,
              shortDescription: `Unique issue ${fileIdx}-${line}`,
            })
          );
        }
      }

      const context = createMockContext(issues);

      const startTime = Date.now();
      await stage.execute(context);
      const duration = Date.now() - startTime;

      // Should complete in reasonable time (< 100ms for 1000 issues)
      expect(duration).toBeLessThan(100);

      // All issues should be kept (no duplicates)
      expect(context.issues).toHaveLength(issues.length);
    });
  });

  describe('Combined deduplication', () => {
    test('should apply both location and semantic deduplication', async () => {
      const stage = createDeduplicationStage();
      const context = createMockContext([
        // Exact duplicates (location)
        createIssue({ file: 'a.ts', lineStart: 10, lineEnd: 10, shortDescription: 'Issue A' }),
        createIssue({ file: 'a.ts', lineStart: 10, lineEnd: 10, shortDescription: 'Issue A' }),

        // Semantic duplicates (similar, within 10 lines)
        createIssue({
          file: 'a.ts',
          lineStart: 20,
          lineEnd: 20,
          shortDescription: 'Missing null check',
        }),
        createIssue({
          file: 'a.ts',
          lineStart: 25,
          lineEnd: 25,
          shortDescription: 'Missing null check here',
        }),

        // Unique issue
        createIssue({
          file: 'b.ts',
          lineStart: 50,
          lineEnd: 50,
          shortDescription: 'Something else',
        }),
      ]);

      await stage.execute(context);

      // Should have 3 issues: 1 from location dedup, 1 from semantic dedup, 1 unique
      expect(context.issues).toHaveLength(3);
    });
  });
});
