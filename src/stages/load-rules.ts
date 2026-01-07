/**
 * Stage 0: Load Rules
 *
 * Loads rule refs and agents into the pipeline context.
 * Full rule content is loaded lazily during matching.
 */

import type { Stage, StageResult, PipelineContext } from '../types';
import { loadRuleRefs } from '../rules';
import { loadAgents } from '../agents';
import { log } from '../logger';

export function createLoadRulesStage(): Stage {
  return {
    id: 'load-rules',
    name: 'Load Rules',
    description: 'Load matching rules and agents',
    enabled: true,
    order: 0,
    execute: async (context: PipelineContext): Promise<StageResult> => {
      const startTime = Date.now();

      // Load rule refs (lightweight) and agents in parallel
      const [ruleRefs, agents] = await Promise.all([loadRuleRefs(), loadAgents()]);

      // Store in context for subsequent stages
      context.ruleRefs = ruleRefs;
      context.agents = agents;

      if (!context.quiet) {
        log.sync(`Loaded ${ruleRefs.length} rule(s), ${agents.length} agent(s)`);
      }

      return {
        stageId: 'load-rules',
        stageName: 'Load Rules',
        success: true,
        duration: Date.now() - startTime,
      };
    },
  };
}
