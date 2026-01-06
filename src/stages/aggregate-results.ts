/**
 * Stage 3: Aggregate Results
 */

import type { Stage, StageResult, PipelineContext } from "../types";
import { log } from "../logger";

export function createAggregateResultsStage(): Stage {
  return {
    id: "aggregate-results",
    name: "Aggregate Results",
    description: "Collect results",
    enabled: true,
    order: 3,
    execute: async (context: PipelineContext): Promise<StageResult> => {
      const startTime = Date.now();
      const success = context.results.filter((r) => r.success).length;
      const failed = context.results.filter((r) => !r.success).length;

      log.sync(`Results: ${success} success, ${failed} failed`);

      return {
        stageId: "aggregate-results",
        stageName: "Aggregate Results",
        success: true,
        duration: Date.now() - startTime,
      };
    },
  };
}

