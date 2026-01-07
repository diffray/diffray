/**
 * Stage 2: Execute Agents
 */

import type {
  Stage,
  StageResult,
  PipelineContext,
  ExecutionContext,
  AgentResult,
  GitDiff,
} from '../types';
import { agentRegistry } from '../agents/registry';
import { executorFactory } from '../executors/factory';
import { log, Spinner } from '../logger';
import { parseIssuesAuto } from '../issue-parser';
import { batchDiffs, formatBatchInfo } from '../token-utils';
import { getTokenCounterName, estimateTokens } from '../token-counter';

export function createExecuteAgentsStage(): Stage {
  return {
    id: 'execute-agents',
    name: 'Execute Agents',
    description: 'Execute Agents via Executors',
    enabled: true,
    order: 2,
    execute: async (context: PipelineContext): Promise<StageResult> => {
      const startTime = Date.now();

      // Show token counter info in verbose mode
      if (context.verbose && !context.quiet) {
        log.plain(`Token counter: ${getTokenCounterName()}`);
      }

      // Get enabled Agents
      const enabledAgents = agentRegistry.listEnabled();

      if (enabledAgents.length === 0) {
        if (!context.quiet) {
          log.warn('No enabled Agents found');
        }
        return {
          stageId: 'execute-agents',
          stageName: 'Execute Agents',
          success: true,
          duration: Date.now() - startTime,
        };
      }

      if (!context.quiet) {
        log.sync(`Executing ${enabledAgents.length} Agent(s)...`);
      }

      // Execute all Agents in parallel
      const results = await Promise.all(
        enabledAgents.map(async (agent) => {
          try {
            // Get executor
            const executor = executorFactory.get(agent.executor);
            if (!executor) {
              if (!context.quiet) {
                log.warn(`Executor not found: ${agent.executor}`);
              }
              return null;
            }

            // Find matched rule for this Agent
            const matchedRule = context.matchedRules?.find((mr) => mr.agent.id === agent.id);

            // Get diffs for this Agent (from matched rule)
            let agentDiffs: GitDiff[];
            if (matchedRule?.files) {
              // Filter diffs by matched files
              const matchedFileSet = new Set(matchedRule.files);
              agentDiffs = context.diffs.filter((diff) => matchedFileSet.has(diff.file));
            } else {
              // Use all diffs if no matched rule
              agentDiffs = context.diffs;
            }

            // Build system prompt: Agent.systemPrompt (agent settings/focus) + Rule.prompt (specific task)
            let systemPrompt = agent.systemPrompt;
            if (matchedRule?.rule.prompt) {
              systemPrompt = `${agent.systemPrompt}\n\n${matchedRule.rule.prompt}`;
            }

            // Split diffs into batches
            const batches = batchDiffs(agentDiffs, systemPrompt);

            // Log batch information (skip if in quiet mode)
            if (context.quiet) {
              // Skip logging in quiet mode
            } else if (batches.length > 1) {
              log.sync(`${agent.name}: ${batches.length} batches (${agentDiffs.length} files)`);
              if (context.verbose) {
                batches.forEach((batch) => {
                  log.plain(`  ${formatBatchInfo(batch, true)}`);
                });
              }
            } else if (context.verbose && batches.length === 1 && batches[0]) {
              // Show token info even for single batch in verbose mode
              log.plain(`  ${formatBatchInfo(batches[0], true)}`);
            }

            // Execute batches in parallel for this Agent
            const batchResults = await Promise.all(
              batches.map(async (batch) => {
                const batchSpinner: Spinner | null = context.quiet
                  ? null
                  : new Spinner(
                      batches.length > 1
                        ? `${agent.name} (batch ${batch.batchIndex + 1}/${batches.length})...`
                        : `${agent.name}...`
                    );

                // Prepare batch input
                const batchDiffsText = batch.diffs
                  .map((diff) => `File: ${diff.file}\n${diff.diff}`)
                  .join('\n\n');

                // Build full prompt for display
                const fullPrompt = `${systemPrompt}\n\n# Input:\n${batchDiffsText}`;

                // Show prompt in verbose mode BEFORE execution
                if (context.verbose && !context.quiet) {
                  const systemTokens = estimateTokens(systemPrompt);
                  const inputTokens = estimateTokens(batchDiffsText);

                  log.newline();
                  log.plain(
                    `Prompt for ${agent.name} (batch ${batch.batchIndex + 1}/${batches.length}):`
                  );
                  log.plain(
                    `   Tokens: ${batch.tokenCount.toLocaleString()} (~${systemTokens.toLocaleString()} system + ~${inputTokens.toLocaleString()} input)`
                  );
                  log.plain('─'.repeat(80));
                  log.plain(fullPrompt);
                  log.plain('─'.repeat(80));
                  log.newline();
                }

                // Start spinner
                if (batchSpinner) {
                  batchSpinner.start();
                }

                try {
                  // Create execution context
                  const execContext: ExecutionContext = {
                    agent,
                    executor: executor.getInfo(),
                    input: batchDiffsText,
                    systemPrompt,
                    verbose: context.verbose,
                  };

                  // Execute batch
                  const result = await executorFactory.executeAgent(execContext);

                  // Parse issues from batch output
                  const batchIssues = parseIssuesAuto(
                    result.output,
                    result.agentId,
                    result.agentName
                  );

                  if (batchSpinner) {
                    if (result.success) {
                      batchSpinner.succeed(
                        batches.length > 1
                          ? `${agent.name} (batch ${batch.batchIndex + 1}/${batches.length}, ${result.duration}ms)`
                          : `${agent.name} (${result.duration}ms)`
                      );
                    } else {
                      batchSpinner.fail(
                        `${agent.name} (batch ${batch.batchIndex + 1}/${batches.length}): ${result.error}`
                      );
                    }
                  }

                  return {
                    issues: batchIssues,
                    duration: result.duration,
                    success: result.success,
                    error: result.error,
                  };
                } catch (error) {
                  const errorMessage = error instanceof Error ? error.message : String(error);
                  if (batchSpinner) {
                    batchSpinner.fail(
                      `${agent.name} (batch ${batch.batchIndex + 1}/${batches.length}): ${errorMessage}`
                    );
                  }
                  return {
                    issues: [],
                    duration: 0,
                    success: false,
                    error: errorMessage,
                  };
                }
              })
            );

            // Collect all issues, errors and calculate total duration
            const allIssues: ReturnType<typeof parseIssuesAuto> = [];
            const errors: string[] = [];
            let totalDuration = 0;

            for (const batchResult of batchResults) {
              allIssues.push(...batchResult.issues);
              totalDuration += batchResult.duration;
              if (batchResult.error) {
                errors.push(batchResult.error);
              }
            }

            // Add all issues to context
            context.issues.push(...allIssues);

            const batchSuccess = batchResults.every((batchResult) => batchResult.success);

            // Format error message (deduplicate similar errors)
            let agentError: string | undefined;
            if (errors.length > 0) {
              const uniqueErrors = [...new Set(errors)];
              agentError =
                uniqueErrors.length === 1 && errors.length > 1
                  ? `${uniqueErrors[0]} (${errors.length} batches)`
                  : uniqueErrors.join('; ');
            }

            // Create combined AgentResult
            const agentResult: AgentResult = {
              agentId: agent.id,
              agentName: agent.name,
              executor: agent.executor,
              executorName: executorFactory.get(agent.executor)?.getInfo().name || 'unknown',
              success: batchSuccess,
              output: `Processed ${batches.length} batch(es), found ${allIssues.length} issue(s)`,
              duration: totalDuration,
              issues: allIssues,
              error: agentError,
            };

            context.results.push(agentResult);

            return agentResult;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (!context.quiet) {
              log.error(`${agent.name}: ${errorMessage}`);
            }

            const agentResult: AgentResult = {
              agentId: agent.id,
              agentName: agent.name,
              executor: agent.executor,
              executorName: 'unknown',
              success: false,
              output: '',
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
      const failedAgents = results.filter((r) => r && !r.success);
      const failureCount = failedAgents.length;

      if (!context.quiet) {
        log.done(`Completed: ${successCount}/${enabledAgents.length} succeeded`);
      }

      // Collect error messages from failed agents
      let stageError: string | undefined;
      if (failureCount > 0) {
        const errorParts = failedAgents
          .map((a) => `${a?.agentName || 'Unknown'}: ${a?.error || 'execution failed'}`)
          .filter(Boolean);
        stageError = errorParts.join('; ');
      }

      return {
        stageId: 'execute-agents',
        stageName: 'Execute Agents',
        success: failureCount === 0,
        duration: Date.now() - startTime,
        error: stageError,
      };
    },
  };
}
