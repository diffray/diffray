/**
 * Stage 4: Deduplication
 */

import type { Stage, StageResult, PipelineContext } from "../types";
import { log } from "../logger";

export function createDeduplicationStage(): Stage {
  return {
    id: "deduplication",
    name: "Deduplication",
    description: "Remove duplicate results and issues",
    enabled: true,
    order: 4,
    execute: async (context: PipelineContext): Promise<StageResult> => {
      const startTime = Date.now();
      const beforeResults = context.results.length;

      // Step 1: Deduplicate results by subAgentId:executorId
      const seen = new Set<string>();
      context.results = context.results.filter((result) => {
        const key = `${result.subAgentId}:${result.executorId}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });

      const removedResults = beforeResults - context.results.length;
      if (removedResults > 0 && !context.quiet) {
        log.sync(`Removed ${removedResults} duplicate result(s)`);
      }

      // Step 2: Deduplicate issues within each result by file:lineStart:lineEnd
      let totalIssuesBefore = 0;
      let totalIssuesAfter = 0;

      context.results.forEach((result) => {
        const issuesBefore = result.issues.length;
        totalIssuesBefore += issuesBefore;

        const seenIssues = new Set<string>();
        result.issues = result.issues.filter((issue) => {
          const issueKey = `${issue.file}:${issue.lineStart}:${issue.lineEnd}`;
          if (seenIssues.has(issueKey)) {
            return false;
          }
          seenIssues.add(issueKey);
          return true;
        });

        totalIssuesAfter += result.issues.length;
      });

      const removedIssues = totalIssuesBefore - totalIssuesAfter;
      if (removedIssues > 0 && !context.quiet) {
        log.sync(`Removed ${removedIssues} duplicate issue(s)`);
      }

      return {
        stageId: "deduplication",
        stageName: "Deduplication",
        success: true,
        duration: Date.now() - startTime,
      };
    },
  };
}

