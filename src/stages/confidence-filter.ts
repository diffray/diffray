/**
 * Stage 3.5: Confidence Filter
 * Filters out issues below the minimum confidence threshold
 */

import type { Stage, StageResult, PipelineContext } from '../types';
import { log } from '../logger';

const DEFAULT_MIN_CONFIDENCE = 80;

export function createConfidenceFilterStage(): Stage {
  return {
    id: 'confidence-filter',
    name: 'Confidence Filter',
    description: 'Filter issues by confidence threshold',
    enabled: true,
    order: 3.5, // After aggregate-results (3), before deduplication (4)
    execute: async (context: PipelineContext): Promise<StageResult> => {
      const startTime = Date.now();

      const minConfidence = context.minConfidence ?? DEFAULT_MIN_CONFIDENCE;

      // Count issues before filtering
      let totalBefore = 0;
      let filteredOut = 0;
      let withoutConfidence = 0;

      // Filter issues in each result
      for (const result of context.results) {
        const beforeCount = result.issues.length;
        totalBefore += beforeCount;

        result.issues = result.issues.filter((issue) => {
          // Keep issues without confidence (for backward compatibility)
          // or issues with confidence >= threshold
          if (issue.confidence === undefined) {
            withoutConfidence++;
            return true;
          }
          return issue.confidence >= minConfidence;
        });

        filteredOut += beforeCount - result.issues.length;
      }

      const totalAfter = totalBefore - filteredOut;

      // Synchronize context.issues with filtered results
      context.issues = context.results.flatMap((r) => r.issues);

      if (!context.quiet) {
        if (totalBefore > 0) {
          log.sync(
            `Confidence filter (>=${minConfidence}%): ${totalAfter} kept, ${filteredOut} filtered out`
          );
        }

        // Warn if issues without confidence bypassed filtering
        if (withoutConfidence > 0) {
          log.warn(
            `${withoutConfidence} issue(s) without confidence field bypassed filtering (backward compatibility)`
          );
        }
      }

      return {
        stageId: 'confidence-filter',
        stageName: 'Confidence Filter',
        success: true,
        duration: Date.now() - startTime,
        output: { totalBefore, totalAfter, filteredOut, minConfidence },
      };
    },
  };
}
