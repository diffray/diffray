/**
 * Stage 1: Match Rules
 *
 * Matches rule refs to files and lazy-loads prompts only for matched rules
 */

import type { Stage, StageResult, PipelineContext } from '../types';
import { matchAndLoadRules } from '../rules';
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

      // Use rule refs and agents from context (loaded in load-rules stage)
      const ruleRefs = context.ruleRefs ?? [];
      const agents = context.agents ?? [];

      // Match by patterns first, then load prompts only for matched rules
      const matched = await matchAndLoadRules(ruleRefs, context.diffs, agents);

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
