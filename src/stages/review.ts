/**
 * Stage 2: Review - Run code review agents
 */

import type {
  Stage,
  StageResult,
  PipelineContext,
  ExecutionContext,
  AgentResult,
  Issue,
  Agent,
} from '../types';
import { agentRegistry } from '../agents/registry';
import { executorFactory } from '../executors';
import { log, MultiProgress } from '../logger';
import { parseIssues } from '../issue-parser';
import { batchDiffs, formatBatchInfo } from '../token-utils';
import { getTokenCounterName, estimateTokens } from '../token-counter';
import { createLimiter } from '../concurrency';
import { loadInstructions } from '../config';
import { withSpinner, aggregateErrors, type BatchResult } from '../batch-executor';
import { matchPattern } from '../rules';

interface BatchInfo {
  batches: ReturnType<typeof batchDiffs>;
  files: number;
  rules: number;
  ruleNames: string[];
  systemPrompt: string;
  fileToRule: Map<string, string>; // Map file path to rule name
}

/** Result type for agent batch execution */
type AgentBatchResult = BatchResult<Issue[]>;

async function prepareBatchInfo(
  enabledAgents: Agent[],
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
    // Create file -> rule mapping
    // Strategy: When a file matches multiple rules, use the most specific rule
    // (determined by longest matching pattern length)
    const fileToRule = new Map<string, string>();
    const fileToPatternLength = new Map<string, number>();
    const matchedFileSet = new Set<string>();

    for (const mr of matchedRules) {
      for (const file of mr.files) {
        matchedFileSet.add(file);

        // Find longest matching pattern for this file
        const matchingPattern = mr.rule.patterns.find((pattern) => matchPattern(file, pattern));

        const patternLength = matchingPattern?.length ?? 0;
        const currentLength = fileToPatternLength.get(file) ?? 0;

        // Use this rule if it has a longer (more specific) pattern
        if (patternLength > currentLength) {
          fileToRule.set(file, mr.rule.name);
          fileToPatternLength.set(file, patternLength);
        }
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
    const ruleNames = matchedRules.map((mr) => mr.rule.name);
    agentBatchInfo.set(agent.name, {
      batches,
      files: agentDiffs.length,
      rules: matchedRules.length,
      ruleNames,
      systemPrompt,
      fileToRule,
    });
  }

  return agentBatchInfo;
}

async function executeBatch(
  batch: ReturnType<typeof batchDiffs>[0],
  batches: ReturnType<typeof batchDiffs>,
  agent: Agent,
  executor: NonNullable<ReturnType<typeof executorFactory.get>>,
  systemPrompt: string,
  systemTokens: number,
  fileToRule: Map<string, string>,
  context: PipelineContext,
  limit: ReturnType<typeof createLimiter>,
  progress?: MultiProgress
): Promise<AgentBatchResult> {
  return limit(async () => {
    // Mark task as running on first batch
    if (batch.batchIndex === 0) {
      progress?.startTask(agent.name);
    }

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
    ]
      .filter(Boolean)
      .join('\n');

    // Build file->rule mapping section for prompt
    const fileRuleMappings = batch.diffs
      .map((diff) => {
        const ruleName = fileToRule.get(diff.file);
        return ruleName ? `- ${diff.file}: rule="${ruleName}"` : null;
      })
      .filter(Boolean);

    const ruleContext =
      fileRuleMappings.length > 0
        ? `\n\n# File-Rule Mappings\n\nEach file was matched by a specific rule. Include the rule name in the "rule" field of each issue:\n${fileRuleMappings.join('\n')}`
        : '';

    const batchDiffsText = `${repoContext}${ruleContext}\n\n${batch.diffs
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
      log.plain(`Prompt for ${agent.name} (batch ${batch.batchIndex + 1}/${batches.length}):`);
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

    // Core execution logic - shared between progress and spinner paths
    const executeCore = async (): Promise<{ success: boolean; data: Issue[]; error?: string }> => {
      const result = await executorFactory.executeAgent(execContext);
      // Parse issues - LLM should return rule field based on file-rule mapping in prompt
      const batchIssues = parseIssues(result.output, agent.name);
      return {
        success: result.success,
        data: batchIssues,
        error: result.error,
      };
    };

    // Use MultiProgress if available, otherwise fall back to withSpinner
    if (progress) {
      const startTime = Date.now();
      try {
        const result = await executeCore();
        const duration = Date.now() - startTime;

        if (result.success) {
          progress.completeBatch(agent.name);
        } else {
          progress.failTask(agent.name);
        }

        return { ...result, duration };
      } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);
        progress.failTask(agent.name);

        return { success: false, data: [], error: errorMessage, duration };
      }
    }

    // Fallback to withSpinner for quiet/stream/verbose modes
    return withSpinner(
      {
        label: agent.name,
        batchIndex: batch.batchIndex,
        totalBatches: batches.length,
      },
      context.quiet ?? false,
      executeCore,
      (_issues, duration) =>
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
  agent: Agent,
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
    executor: agent.executor || 'unknown',
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

      // Load global instructions from ~/.diffray/instructions.md
      const instructions = await loadInstructions();

      // Get stage settings from config
      const config = context.config!;
      const executorConfig = config.executors[config.executor] || {};
      const stageSettings = executorConfig.review || {};
      const stageConcurrency = stageSettings.concurrency ?? context.concurrency;

      // Create concurrency limiter
      const limit = createLimiter(stageConcurrency);

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

      // Count agents that will actually execute (only review stage agents)
      const reviewAgents = enabledAgents.filter((a) => a.stage !== 'validation');
      const agentsToExecute = reviewAgents.filter((a) => agentBatchInfo.has(a.name));
      const skippedAgents = reviewAgents.filter((a) => !agentBatchInfo.has(a.name));

      // Show enhanced summary
      if (!context.quiet) {
        log.sync(
          `Code Review: ${agentsToExecute.length} agent${agentsToExecute.length !== 1 ? 's' : ''} (${totalBatches} batch${totalBatches !== 1 ? 'es' : ''} total)...`
        );

        // Show skipped agents
        for (const agent of skippedAgents) {
          log.plain(`  • ${agent.name}: skipped (no matching rules)`);
        }
      }

      // Create MultiProgress (only when not quiet/stream/verbose)
      const useMultiProgress = !context.quiet && !context.stream && !context.verbose;
      const progress = useMultiProgress ? new MultiProgress() : undefined;

      // Add tasks to progress with file/rule counts for ETA
      if (progress) {
        for (const agent of agentsToExecute) {
          const info = agentBatchInfo.get(agent.name);
          if (info) {
            const rulesStr = info.ruleNames.slice(0, 3).join(', ');
            const detail = `${info.files} files | ${rulesStr}${info.rules > 3 ? '...' : ''}`;
            progress.addTask(
              agent.name,
              agent.name,
              info.batches.length,
              info.files,
              info.rules,
              detail
            );
          }
        }
        progress.start();
      }

      // Execute all Agents in parallel (only those with batch info)
      let results: (AgentResult | null)[];
      try {
        results = await Promise.all(
          agentsToExecute.map(async (agent) => {
            try {
              // Get executor
              const executorName = agent.executor || config.executor;
              const executor = executorFactory.get(executorName);
              if (!executor) {
                if (!context.quiet) {
                  log.warn(`Executor not found: ${executorName}`);
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
                  executeBatch(
                    batch,
                    batches,
                    agent,
                    executor,
                    systemPrompt,
                    systemTokens,
                    batchInfo.fileToRule,
                    context,
                    limit,
                    progress
                  )
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
                executor: agent.executor || 'unknown',
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
      } finally {
        // Stop progress display (guaranteed cleanup)
        progress?.stop();
      }

      const successCount = results.filter((r) => r?.success).length;
      const failedAgents = results.filter((r) => r && !r.success);
      const failureCount = failedAgents.length;

      const duration = Date.now() - startTime;
      const durationStr = duration >= 1000 ? `${(duration / 1000).toFixed(1)}s` : `${duration}ms`;

      if (!context.quiet) {
        log.done(
          `Review complete: ${successCount}/${agentsToExecute.length} agents (${durationStr})`
        );
      }

      // Warn about failed agents but continue with validation for successful ones
      if (failureCount > 0 && !context.quiet) {
        for (const agent of failedAgents) {
          log.warn(
            `Agent "${agent?.agent}" failed: ${agent?.error || 'execution failed'} - issues from this agent excluded`
          );
        }
      }

      // Stage succeeds if at least one agent succeeded (so validation can run)
      // Only fail if ALL agents failed (nothing to validate)
      const stageSuccess = successCount > 0;

      // Collect error messages for reporting
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
        success: stageSuccess,
        duration,
        error: stageError,
      };
    },
  };
}
