/**
 * Stage 2: Execute Agents
 */

import type { Stage, StageResult, PipelineContext, ExecutionContext, AgentResult } from '../types';
import { agentRegistry } from '../agents/registry';
import { executorFactory } from '../executors';
import { log, Spinner } from '../logger';
import { parseIssues } from '../issue-parser';
import { batchDiffs, formatBatchInfo } from '../token-utils';
import { getTokenCounterName, estimateTokens } from '../token-counter';
import { createLimiter } from '../concurrency';

export function createExecuteAgentsStage(): Stage {
  return {
    id: 'execute-agents',
    name: 'Execute Agents',
    description: 'Execute Agents via Executors',
    enabled: true,
    order: 2,
    execute: async (context: PipelineContext): Promise<StageResult> => {
      const startTime = Date.now();

      // Create concurrency limiter from context
      const limit = createLimiter(context.concurrency);

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

      // Pre-calculate batch info for all enabled agents
      const agentBatchInfo = new Map<
        string,
        { batches: ReturnType<typeof batchDiffs>; files: number; rules: number; systemPrompt: string }
      >();
      let totalBatches = 0;

      for (const agent of enabledAgents) {
        // Find ALL matched rules for this Agent
        const matchedRules = context.matchedRules?.filter((mr) => mr.agent.id === agent.id) || [];

        // Skip agents with no matched rules
        if (matchedRules.length === 0) {
          continue;
        }

        // Get diffs for this Agent (combine files from all matched rules)
        // Combine files from all rules (deduplicated)
        const matchedFileSet = new Set<string>();
        for (const mr of matchedRules) {
          for (const file of mr.files) {
            matchedFileSet.add(file);
          }
        }
        const agentDiffs = context.diffs.filter((diff) => matchedFileSet.has(diff.file));

        // Build system prompt: Agent.systemPrompt + all Rule.prompts
        let systemPrompt = agent.systemPrompt;
        const rulePrompts = matchedRules
          .map((mr) => mr.rule.prompt)
          .filter(Boolean)
          .join('\n\n');
        if (rulePrompts) {
          systemPrompt = `${agent.systemPrompt}\n\n${rulePrompts}`;
        }

        // Calculate batches
        const batches = batchDiffs(agentDiffs, systemPrompt);
        agentBatchInfo.set(agent.id, {
          batches,
          files: agentDiffs.length,
          rules: matchedRules.length,
          systemPrompt,
        });
        totalBatches += batches.length;
      }

      // Count agents that will actually execute
      const agentsToExecute = enabledAgents.filter((a) => agentBatchInfo.has(a.id));
      const skippedAgents = enabledAgents.filter((a) => !agentBatchInfo.has(a.id));

      // Show enhanced summary
      if (!context.quiet) {
        log.sync(
          `Executing ${agentsToExecute.length} Agent(s) (${totalBatches} batch${totalBatches !== 1 ? 'es' : ''} total)...`
        );

        // Show per-agent breakdown
        if (agentsToExecute.length > 0 || skippedAgents.length > 0) {
          for (const agent of agentsToExecute) {
            const info = agentBatchInfo.get(agent.id);
            if (info) {
              log.plain(
                `  • ${agent.name}: ${info.batches.length} batch${info.batches.length !== 1 ? 'es' : ''}, ${info.rules} rule${info.rules !== 1 ? 's' : ''}, ${info.files} file${info.files !== 1 ? 's' : ''}`
              );
            }
          }
          // Show skipped agents
          for (const agent of skippedAgents) {
            log.plain(`  • ${agent.name}: skipped (no matching rules)`);
          }
        }
      }

      // Execute all Agents in parallel (only those with batch info)
      const results = await Promise.all(
        agentsToExecute.map(async (agent) => {
          try {
            // Get executor
            const executor = executorFactory.get(agent.executor);
            if (!executor) {
              if (!context.quiet) {
                log.warn(`Executor not found: ${agent.executor}`);
              }
              return null;
            }

            // Get pre-calculated batch info (guaranteed to exist for agentsToExecute)
            const batchInfo = agentBatchInfo.get(agent.id)!;
            const { batches, systemPrompt } = batchInfo;

            const systemTokens = estimateTokens(systemPrompt);

            // Log detailed batch information only in verbose mode (summary already shown upfront)
            if (!context.quiet && context.verbose) {
              batches.forEach((batch) => {
                log.plain(`  ${formatBatchInfo(batch, true)}`);
              });
            }

            // Execute batches with concurrency limit
            const batchResults = await Promise.all(
              batches.map((batch) =>
                limit(async () => {
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

                  // Show prompt in verbose mode BEFORE execution
                  if (context.verbose && !context.quiet) {
                    const inputTokens = batch.tokenCount - systemTokens;

                    // Build summarized input (show file names with diff size instead of full diff)
                    const summarizedInput = batch.diffs
                      .map((diff) => `File: ${diff.file} <diff ${diff.diff.length} chars>`)
                      .join('\n');
                    const summarizedPrompt = `${systemPrompt}\n\n# Input:\n${summarizedInput}`;

                    log.newline();
                    log.plain(
                      `Prompt for ${agent.name} (batch ${batch.batchIndex + 1}/${batches.length}):`
                    );
                    log.plain(
                      `   Tokens: ${batch.tokenCount.toLocaleString()} (~${systemTokens.toLocaleString()} system + ~${inputTokens.toLocaleString()} input)`
                    );
                    log.plain('─'.repeat(80));
                    log.plain(summarizedPrompt);
                    log.plain('─'.repeat(80));
                    log.newline();
                  }

                  try {
                    // Start spinner inside try to ensure cleanup
                    batchSpinner?.start();

                    // Create execution context
                    const execContext: ExecutionContext = {
                      agent,
                      executor: executor.getInfo(),
                      input: batchDiffsText,
                      systemPrompt,
                      verbose: context.verbose,
                      quiet: context.quiet,
                      stream: context.stream,
                    };

                    // Execute batch
                    const result = await executorFactory.executeAgent(execContext);

                    // Parse issues from batch output
                    const batchIssues = parseIssues(result.output, agent.id);

                    if (result.success) {
                      batchSpinner?.succeed(
                        batches.length > 1
                          ? `${agent.name} (batch ${batch.batchIndex + 1}/${batches.length}, ${result.duration}ms)`
                          : `${agent.name} (${result.duration}ms)`
                      );
                    } else {
                      batchSpinner?.fail(
                        `${agent.name} (batch ${batch.batchIndex + 1}/${batches.length}): ${result.error}`
                      );
                    }

                    return {
                      issues: batchIssues,
                      duration: result.duration,
                      success: result.success,
                      error: result.error,
                    };
                  } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    batchSpinner?.fail(
                      `${agent.name} (batch ${batch.batchIndex + 1}/${batches.length}): ${errorMessage}`
                    );
                    return {
                      issues: [],
                      duration: 0,
                      success: false,
                      error: errorMessage,
                    };
                  } finally {
                    // Ensure spinner is stopped and cursor restored
                    batchSpinner?.stop();
                  }
                })
              )
            );

            // Collect all issues, errors and calculate total duration
            const allIssues: ReturnType<typeof parseIssues> = [];
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
        log.done(`Completed: ${successCount}/${agentsToExecute.length} succeeded`);
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
