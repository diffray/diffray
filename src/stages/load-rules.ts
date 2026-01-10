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

      // Load rule refs (lightweight)
      // Use agents from context if already loaded (with correct executor settings from CLI)
      let [ruleRefs, agents] = await Promise.all([
        loadRuleRefs(),
        context.agents && context.agents.length > 0
          ? Promise.resolve(context.agents)
          : loadAgents(),
      ]);

      // Apply rule filters
      if (context.ruleFilter && context.ruleFilter.length > 0) {
        const filterSet = new Set(context.ruleFilter);
        ruleRefs = ruleRefs.filter((r) => filterSet.has(r.name));
      }
      if (context.excludeRules && context.excludeRules.length > 0) {
        const excludeSet = new Set(context.excludeRules);
        ruleRefs = ruleRefs.filter((r) => !excludeSet.has(r.name));
      }

      // Apply agent filters
      if (context.agentFilter && context.agentFilter.length > 0) {
        const filterSet = new Set(context.agentFilter);
        agents = agents.filter((a) => filterSet.has(a.name));
      }
      if (context.excludeAgents && context.excludeAgents.length > 0) {
        const excludeSet = new Set(context.excludeAgents);
        agents = agents.filter((a) => !excludeSet.has(a.name));
      }

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
