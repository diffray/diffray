/**
 * Stage 2: Execute SubAgents
 */

import type { Stage, StageResult, PipelineContext, ExecutionContext, AgentResult, GitDiff } from "../types";
import { subAgentRegistry } from "../subagents/registry";
import { executorFactory } from "../executors/factory";
import { log, Spinner } from "../logger";
import { parseIssuesAuto } from "../issue-parser";
import { batchDiffs, formatBatchInfo, type DiffBatch } from "../token-utils";
import { getTokenCounterName, estimateTokens } from "../token-counter";

export function createExecuteAgentsStage(): Stage {
  return {
    id: "execute-agents",
    name: "Execute SubAgents",
    description: "Execute SubAgents via Executors",
    enabled: true,
    order: 2,
    execute: async (context: PipelineContext): Promise<StageResult> => {
      const startTime = Date.now();

      // Show token counter info in verbose mode
      if (context.verbose) {
        log.plain(`🔢 Token counter: ${getTokenCounterName()}`);
      }

      // Get enabled SubAgents
      const enabledSubAgents = subAgentRegistry.listEnabledSubAgents();

      if (enabledSubAgents.length === 0) {
        log.warn("No enabled SubAgents found");
        return {
          stageId: "execute-agents",
          stageName: "Execute SubAgents",
          success: true,
          duration: Date.now() - startTime,
        };
      }

      log.sync(`Executing ${enabledSubAgents.length} SubAgent(s)...`);

      // Execute all SubAgents in parallel
      const results = await Promise.all(
        enabledSubAgents.map(async (subAgent) => {
          try {
            // Get executor
            const executor = executorFactory.getExecutor(subAgent.executorId);
            if (!executor) {
              log.warn(`Executor not found: ${subAgent.executorId}`);
              return null;
            }

            // Find matched rule for this SubAgent
            const matchedRule = context.matchedRules?.find(mr => mr.subAgent.id === subAgent.id);

            // Get diffs for this SubAgent (from matched rule)
            let subAgentDiffs: GitDiff[];
            if (matchedRule?.files) {
              // Filter diffs by matched files
              const matchedFileSet = new Set(matchedRule.files);
              subAgentDiffs = context.diffs.filter(diff => matchedFileSet.has(diff.file));
            } else {
              // Use all diffs if no matched rule
              subAgentDiffs = context.diffs;
            }

            // Build system prompt: SubAgent.systemPrompt (agent settings/focus) + Rule.prompt (specific task)
            let systemPrompt = subAgent.systemPrompt;
            if (matchedRule?.rule.prompt) {
              systemPrompt = `${subAgent.systemPrompt}\n\n${matchedRule.rule.prompt}`;
            }

            // Split diffs into batches
            const batches = batchDiffs(subAgentDiffs, systemPrompt);

            if (batches.length > 1) {
              log.sync(`${subAgent.name}: ${batches.length} batches (${subAgentDiffs.length} files)`);
              if (context.verbose) {
                batches.forEach(batch => {
                  log.plain(`  ${formatBatchInfo(batch, true)}`);
                });
              }
            } else if (context.verbose && batches.length === 1 && batches[0]) {
              // Show token info even for single batch in verbose mode
              log.plain(`  ${formatBatchInfo(batches[0], true)}`);
            }

            // Execute batches in parallel for this SubAgent
            const batchResults = await Promise.all(
              batches.map(async (batch) => {
                const batchSpinner = new Spinner(
                  batches.length > 1
                    ? `${subAgent.name} (batch ${batch.batchIndex + 1}/${batches.length})...`
                    : `${subAgent.name}...`
                );

                // Prepare batch input
                const batchDiffsText = batch.diffs
                  .map((diff) => `File: ${diff.file}\n${diff.diff}`)
                  .join("\n\n");

                // Build full prompt for display
                const fullPrompt = `${systemPrompt}\n\n# Input:\n${batchDiffsText}`;

                // Show prompt in verbose mode BEFORE execution
                if (context.verbose) {
                  const systemTokens = estimateTokens(systemPrompt);
                  const inputTokens = estimateTokens(batchDiffsText);

                  log.newline();
                  log.plain(`📝 Prompt for ${subAgent.name} (batch ${batch.batchIndex + 1}/${batches.length}):`);
                  log.plain(`   Tokens: ${batch.tokenCount.toLocaleString()} (~${systemTokens.toLocaleString()} system + ~${inputTokens.toLocaleString()} input)`);
                  log.plain("─".repeat(80));
                  log.plain(fullPrompt);
                  log.plain("─".repeat(80));
                  log.newline();
                }

                // Start spinner
                batchSpinner.start();

                try {
                  // Create execution context
                  const execContext: ExecutionContext = {
                    subAgent,
                    executor: executor.getInfo(),
                    input: batchDiffsText,
                    systemPrompt,
                    verbose: context.verbose,
                  };

                  // Execute batch
                  const result = await executorFactory.executeSubAgent(execContext);

                  // Parse issues from batch output
                  const batchIssues = parseIssuesAuto(
                    result.output,
                    result.subAgentId,
                    result.subAgentName
                  );

                  if (result.success) {
                    batchSpinner.succeed(
                      batches.length > 1
                        ? `${subAgent.name} (batch ${batch.batchIndex + 1}/${batches.length}, ${result.duration}ms)`
                        : `${subAgent.name} (${result.duration}ms)`
                    );
                  } else {
                    batchSpinner.fail(`${subAgent.name} (batch ${batch.batchIndex + 1}/${batches.length}): ${result.error}`);
                  }

                  return {
                    issues: batchIssues,
                    duration: result.duration,
                    success: result.success,
                  };
                } catch (error) {
                  batchSpinner.fail(`${subAgent.name} (batch ${batch.batchIndex + 1}/${batches.length}): ${error}`);
                  return {
                    issues: [],
                    duration: 0,
                    success: false,
                  };
                }
              })
            );

            // Collect all issues and calculate total duration
            const allIssues: any[] = [];
            let totalDuration = 0;

            for (const batchResult of batchResults) {
              allIssues.push(...batchResult.issues);
              totalDuration += batchResult.duration;
            }

            // Add all issues to context
            context.issues.push(...allIssues);

            // Create combined AgentResult
            const agentResult: AgentResult = {
              subAgentId: subAgent.id,
              subAgentName: subAgent.name,
              executorId: subAgent.executorId,
              executorName: executorFactory.getExecutor(subAgent.executorId)?.getInfo().name || "unknown",
              success: true,
              output: `Processed ${batches.length} batch(es), found ${allIssues.length} issue(s)`,
              duration: totalDuration,
              issues: allIssues,
            };

            context.results.push(agentResult);

            return agentResult;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log.error(`${subAgent.name}: ${errorMessage}`);

            const agentResult: AgentResult = {
              subAgentId: subAgent.id,
              subAgentName: subAgent.name,
              executorId: subAgent.executorId,
              executorName: "unknown",
              success: false,
              output: "",
              error: errorMessage,
              duration: 0,
              issues: [],
            };

            context.results.push(agentResult);
            return agentResult;
          }
        })
      );

      const successCount = results.filter((r) => r?.success).length;
      log.sync(`Completed: ${successCount}/${enabledSubAgents.length} succeeded`);

      return {
        stageId: "execute-agents",
        stageName: "Execute SubAgents",
        success: true,
        duration: Date.now() - startTime,
      };
    },
  };
}

