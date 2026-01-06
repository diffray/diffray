/**
 * Stage 0: Load Rules
 */

import type { Stage, StageResult } from "../types";
import { loadRules } from "../rules";
import { log } from "../logger";

export function createLoadRulesStage(): Stage {
  return {
    id: "load-rules",
    name: "Load Rules",
    description: "Load matching rules",
    enabled: true,
    order: 0,
    execute: async (): Promise<StageResult> => {
      const startTime = Date.now();
      const rules = await loadRules();

      log.sync(`Loaded ${rules.length} rule(s)`);

      return {
        stageId: "load-rules",
        stageName: "Load Rules",
        success: true,
        duration: Date.now() - startTime,
      };
    },
  };
}

