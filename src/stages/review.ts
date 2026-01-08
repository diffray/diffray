/**
 * Stage 2: Review - Run code review agents
 */

import type { Stage, StageResult, PipelineContext, ExecutionContext, AgentResult, Issue } from '../types';
import { agentRegistry } from '../agents/registry';
import { executorFactory } from '../executors';
import { log } from '../logger';
import { parseIssues } from '../issue-parser';
import { batchDiffs, formatBatchInfo } from '../token-utils';
import { getTokenCounterName, estimateTokens } from '../token-counter';
import { createLimiter } from '../concurrency';
import { loadInstructions } from '../config';
import { withSpinner, aggregateErrors, type BatchResult } from '../batch-executor';

interface BatchInfo {
  batches: ReturnType<typeof batchDiffs>;
  files: number;
  rules: number;
  systemPrompt: string;
}

/** Result type for agent batch execution */
type AgentBatchResult = BatchResult<Issue[]>;

async function prepareBatchInfo(
  enabledAgents: any[],
  context: PipelineContext,
  instructions: string | null
): Promise<Map<string, BatchInfo>> {
  const agentBatchInfo = new Map<string, BatchInfo>();

  for (const agent of enabledAgents) {
    // Find ALL matched rules for this Agent
    const matchedRules = context.matchedRules?.filter((mr) => mr.agent.name === agent.name) || [];

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

    // Build system prompt: Agent.systemPrompt + Rule.prompts + global instructions
    let systemPrompt = agent.systemPrompt;
    const rulePrompts = matchedRules
      .map((mr) => mr.rule.prompt)
      .filter(Boolean)
      .join('\n\n');
    if (rulePrompts) {
      systemPrompt = `${systemPrompt}\n\n${rulePrompts}`;
    }
    if (instructions) {
      systemPrompt = `${systemPrompt}\n\n${instructions}`;
    }

    // Calculate batches
    const batches = batchDiffs(agentDiffs, systemPrompt);
    agentBatchInfo.set(agent.name, {
      batches,
      files: agentDiffs.length,
      rules: matchedRules.length,
      systemPrompt,
    });
  }

  return agentBatchInfo;
}

async function executeBatch(
  batch: ReturnType<typeof batchDiffs>[0],
  batches: ReturnType<typeof batchDiffs>,
  agent: any,
  executor: any,
  systemPrompt: string,
  systemTokens: number,
  context: PipelineContext,
  limit: any
): Promise<AgentBatchResult> {
  return limit(async () => {
    // Prepare batch input with repository context
    // Include explicit base path instruction for CLI tools
    const repoPath = context.metadata.repository;
    const repoContext = [
      `# Repository Context`,
      `Base path: ${repoPath}`,
      `All file paths below are relative to this directory.`,
      `When using tools to read files, prepend this base path to get absolute paths.`,
      context.metadata.baseRef ? `Base ref: ${context.metadata.baseRef}` : null,
      context.metadata.headRef ? `Head ref: ${context.metadata.headRef}` : null,
    ].filter(Boolean).join('\n');

    const batchDiffsText = `${repoContext}\n\n${batch.diffs
      .map((diff) => `File: ${diff.file}\n${diff.diff}`)
      .join('\n\n')}`;

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

    // Create execution context with optional settings override
    const executorInfo =
      agent.executorSettings && executor.applySettings
        ? executor.applySettings(agent.executorSettings)
        : executor.getInfo();

    const execContext: ExecutionContext = {
      agent,
      executor: executorInfo,
      input: batchDiffsText,
      systemPrompt,
      verbose: context.verbose,
      quiet: context.quiet,
      stream: context.stream,
      cwd: context.metadata.repository,
    };

    return withSpinner(
      {
        label: agent.name,
        batchIndex: batch.batchIndex,
        totalBatches: batches.length,
      },
      context.quiet ?? false,
      async () => {
        const result = await executorFactory.executeAgent(execContext);
        const batchIssues = parseIssues(result.output, agent.name);

        return {
          success: result.success,
          data: batchIssues,
          error: result.error,
        };
      },
      (issues, duration) =>
        batches.length > 1
          ? `${agent.name} (batch ${batch.batchIndex + 1}/${batches.length}, ${duration}ms)`
          : `${agent.name} (${duration}ms)`,
      (error) =>
        batches.length > 1
          ? `${agent.name} (batch ${batch.batchIndex + 1}/${batches.length}): ${error}`
          : `${agent.name}: ${error}`
    );
  });
}

function aggregateBatchResults(
  batchResults: AgentBatchResult[],
  agent: any,
  batches: ReturnType<typeof batchDiffs>
): AgentResult {
  // Collect all issues and calculate total duration
  const allIssues: Issue[] = [];
  let totalDuration = 0;

  for (const batchResult of batchResults) {
    allIssues.push(...batchResult.data);
    totalDuration += batchResult.duration || 0;
  }

  const batchSuccess = batchResults.every((batchResult) => batchResult.success);

  // Format error message using shared utility
  const agentError = aggregateErrors(batchResults.map((r) => r.error));

  // Create combined AgentResult
  return {
    agent: agent.name,
    executor: agent.executor,
    success: batchSuccess,
    output: `Processed ${batches.length} batch(es), found ${allIssues.length} issue(s)`,
    duration: totalDuration,
    issues: allIssues,
    error: agentError,
  };
}

export function createReviewStage(): Stage {
  return {
    id: 'review',
    name: 'Review',
    description: 'Run code review agents',
    enabled: true,
    order: 2,
    execute: async (context: PipelineContext): Promise<StageResult> => {
      const startTime = Date.now();

      // Create concurrency limiter from context
      const limit = createLimiter(context.concurrency);

      // Load global instructions from ~/.diffray/instructions.md
      const instructions = await loadInstructions();

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
          stageId: 'review',
          stageName: 'Review',
          success: true,
          duration: Date.now() - startTime,
        };
      }

      // Pre-calculate batch info for all enabled agents
      const agentBatchInfo = await prepareBatchInfo(enabledAgents, context, instructions);
      let totalBatches = 0;

      for (const [, info] of agentBatchInfo) {
        totalBatches += info.batches.length;
      }

      // Count agents that will actually execute
      const agentsToExecute = enabledAgents.filter((a) => agentBatchInfo.has(a.name));
      const skippedAgents = enabledAgents.filter((a) => !agentBatchInfo.has(a.name));

      // Show enhanced summary
      if (!context.quiet) {
        log.sync(
          `Executing ${agentsToExecute.length} Agent(s) (${totalBatches} batch${totalBatches !== 1 ? 'es' : ''} total)...`
        );

        // Show per-agent breakdown
        if (agentsToExecute.length > 0 || skippedAgents.length > 0) {
          for (const agent of agentsToExecute) {
            const info = agentBatchInfo.get(agent.name);
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
            const batchInfo = agentBatchInfo.get(agent.name)!;
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
                executeBatch(batch, batches, agent, executor, systemPrompt, systemTokens, context, limit)
              )
            );

            // Aggregate batch results
            const agentResult = aggregateBatchResults(batchResults, agent, batches);

            // Add all issues to context
            context.issues.push(...agentResult.issues);
            context.results.push(agentResult);

            return agentResult;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (!context.quiet) {
              log.error(`${agent.name}: ${errorMessage}`);
            }

            const agentResult: AgentResult = {
              agent: agent.name,
              executor: agent.executor,
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
          .map((a) => `${a?.agent || 'Unknown'}: ${a?.error || 'execution failed'}`)
          .filter(Boolean);
        stageError = errorParts.join('; ');
      }

      return {
        stageId: 'review',
        stageName: 'Review',
        success: failureCount === 0,
        duration: Date.now() - startTime,
        error: stageError,
      };
    },
  };
}