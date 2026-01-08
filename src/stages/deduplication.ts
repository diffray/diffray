/**
 * Stage 4: Deduplication
 */

import type { Stage, StageResult, PipelineContext } from '../types';
import { log } from '../logger';

export function createDeduplicationStage(): Stage {
  return {
    id: 'deduplication',
    name: 'Deduplication',
    description: 'Remove duplicate results and issues',
    enabled: true,
    order: 4,
    execute: async (context: PipelineContext): Promise<StageResult> => {
      const startTime = Date.now();

      // Step 1: Merge all issues from all results
      const allIssues = context.results.flatMap((result) => result.issues);
      const totalBefore = allIssues.length;

      // Step 2: Deduplicate by agent+location (different agents can report different issues at same location)
      const seen = new Set<string>();
      const deduplicated = allIssues.filter((issue) => {
        const key = `${issue.agent}:${issue.file}:${issue.lineStart}:${issue.lineEnd}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });

      context.issues = deduplicated;

      const removed = totalBefore - deduplicated.length;
      if (removed > 0 && !context.quiet) {
        log.sync(`Removed ${removed} duplicate issue(s)`);
      }

      return {
        stageId: 'deduplication',
        stageName: 'Deduplication',
        success: true,
        duration: Date.now() - startTime,
      };
    },
  };
}
