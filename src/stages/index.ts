/**
 * Stage registry and configuration
 */

import { z } from 'zod';
import type { Stage } from '../types';
import { loadConfig, updateConfig } from '../config';
import { createLoadRulesStage } from './load-rules';
import { createMatchRulesStage } from './match-rules';
import { createExecuteAgentsStage } from './execute-agents';
import { createAggregateResultsStage } from './aggregate-results';
import { createDeduplicationStage } from './deduplication';
import { createValidationStage } from './validation';

/**
 * Stage configuration schema
 */
export const StageConfigSchema = z.object({
  id: z.string(),
  enabled: z.boolean().default(true),
  order: z.number().optional(),
});

/**
 * Built-in stage creators
 */
const BUILTIN_STAGES = {
  'load-rules': createLoadRulesStage,
  'match-rules': createMatchRulesStage,
  'execute-agents': createExecuteAgentsStage,
  'aggregate-results': createAggregateResultsStage,
  deduplication: createDeduplicationStage,
  validation: createValidationStage,
};

/**
 * Load stages configuration
 */
export async function loadStagesConfig() {
  const config = await loadConfig();
  return config.stages;
}

/**
 * Get all stages with configuration applied
 */
export async function getStages(): Promise<Stage[]> {
  const config = await loadConfig();
  const stages: Stage[] = [];

  // Create all built-in stages
  for (const [id, creator] of Object.entries(BUILTIN_STAGES)) {
    const stage = creator();

    // Apply configuration
    const stageConfig = config.stages.find((s) => s.id === id);
    if (stageConfig) {
      stage.enabled = stageConfig.enabled;
      if ('order' in stageConfig && stageConfig.order !== undefined) {
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
    createValidationStage(),
  ];
}

/**
 * Enable/disable stage
 */
export async function toggleStage(stageId: string, enabled: boolean): Promise<void> {
  const config = await loadConfig();
  const stages = [...config.stages];

  const existing = stages.find((s) => s.id === stageId);
  if (existing) {
    existing.enabled = enabled;
  } else {
    stages.push({ id: stageId, enabled });
  }

  await updateConfig({ stages });
}

/**
 * Set stage order
 */
export async function setStageOrder(stageId: string, order: number): Promise<void> {
  const config = await loadConfig();
  const stages = [...config.stages];

  const existingIndex = stages.findIndex((s) => s.id === stageId);
  if (existingIndex >= 0) {
    stages[existingIndex] = { ...stages[existingIndex]!, order };
  } else {
    stages.push({ id: stageId, enabled: true, order });
  }

  await updateConfig({ stages });
}