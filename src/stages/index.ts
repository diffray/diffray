/**
 * Stage registry and configuration
 */

import { join } from "path";
import { homedir } from "os";
import { z } from "zod";
import type { Stage } from "../types";
import { createLoadRulesStage } from "./load-rules";
import { createMatchRulesStage } from "./match-rules";
import { createExecuteAgentsStage } from "./execute-agents";
import { createAggregateResultsStage } from "./aggregate-results";
import { createDeduplicationStage } from "./deduplication";

const DIFFRAY_DIR = join(homedir(), ".diffray");
const STAGES_CONFIG_FILE = join(DIFFRAY_DIR, "stages.json");

/**
 * Stage configuration schema
 */
export const StageConfigSchema = z.object({
  id: z.string(),
  enabled: z.boolean().default(true),
  order: z.number().optional(),
});

export const StagesConfigSchema = z.object({
  stages: z.array(StageConfigSchema).default([]),
});

export type StagesConfig = z.infer<typeof StagesConfigSchema>;

/**
 * Built-in stage creators
 */
const BUILTIN_STAGES = {
  "load-rules": createLoadRulesStage,
  "match-rules": createMatchRulesStage,
  "execute-agents": createExecuteAgentsStage,
  "aggregate-results": createAggregateResultsStage,
  "deduplication": createDeduplicationStage,
};

/**
 * Load stages configuration
 */
export async function loadStagesConfig(): Promise<StagesConfig> {
  try {
    const file = Bun.file(STAGES_CONFIG_FILE);
    if (!(await file.exists())) {
      return { stages: [] };
    }

    const data = await file.json();
    return StagesConfigSchema.parse(data);
  } catch {
    return { stages: [] };
  }
}

/**
 * Save stages configuration
 */
export async function saveStagesConfig(config: StagesConfig): Promise<void> {
  await Bun.write(STAGES_CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * Get all stages with configuration applied
 */
export async function getStages(): Promise<Stage[]> {
  const config = await loadStagesConfig();
  const stages: Stage[] = [];

  // Create all built-in stages
  for (const [id, creator] of Object.entries(BUILTIN_STAGES)) {
    const stage = creator();
    
    // Apply configuration
    const stageConfig = config.stages.find((s) => s.id === id);
    if (stageConfig) {
      stage.enabled = stageConfig.enabled;
      if (stageConfig.order !== undefined) {
        stage.order = stageConfig.order;
      }
    }

    stages.push(stage);
  }

  return stages.sort((a, b) => a.order - b.order);
}

/**
 * Get default stages (all built-in stages enabled)
 */
export function getDefaultStages(): Stage[] {
  return [
    createLoadRulesStage(),
    createMatchRulesStage(),
    createExecuteAgentsStage(),
    createAggregateResultsStage(),
    createDeduplicationStage(),
  ];
}

/**
 * Enable/disable stage
 */
export async function toggleStage(stageId: string, enabled: boolean): Promise<void> {
  const config = await loadStagesConfig();
  
  const existing = config.stages.find((s) => s.id === stageId);
  if (existing) {
    existing.enabled = enabled;
  } else {
    config.stages.push({ id: stageId, enabled });
  }

  await saveStagesConfig(config);
}

/**
 * Set stage order
 */
export async function setStageOrder(stageId: string, order: number): Promise<void> {
  const config = await loadStagesConfig();
  
  const existing = config.stages.find((s) => s.id === stageId);
  if (existing) {
    existing.order = order;
  } else {
    config.stages.push({ id: stageId, enabled: true, order });
  }

  await saveStagesConfig(config);
}

