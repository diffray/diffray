/**
 * Stage 1: Match Rules
 */

import type { Stage, StageResult, PipelineContext } from '../types';
import { loadRules, matchRules } from '../rules';
import { loadAgents } from '../agents';
import { log } from '../logger';

export function createMatchRulesStage(): Stage {
  return {
    id: 'match-rules',
    name: 'Match Rules',
    description: 'Match rules to files',
    enabled: true,
    order: 1,
    execute: async (context: PipelineContext): Promise<StageResult> => {
      const startTime = Date.now();
      const rules = await loadRules();
      const agents = await loadAgents();
      const matched = matchRules(rules, context.diffs, agents);

      // Store matched rules in context for later stages
      context.matchedRules = matched;

      if (!context.quiet) {
        log.sync(`Matched ${matched.length} rule(s)`);

        for (const match of matched) {
          log.plain(`  ${match.rule.name}: ${match.files.length} file(s) → ${match.agent.name}`);
        }
      }

      return {
        stageId: 'match-rules',
        stageName: 'Match Rules',
        success: true,
        duration: Date.now() - startTime,
      };
    },
  };
}
