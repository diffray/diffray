/**
 * Stage 5: Validation
 * Validates issues found by agents using an LLM to filter out false positives
 */

import type {
  Stage,
  StageResult,
  PipelineContext,
  Issue,
  ExecutionContext,
  Agent,
  AgentExecutor,
} from '../types';
import { parseIssues } from '../issue-parser';
import { log } from '../logger';
import { executorFactory } from '../executors';
import { loadConfig } from '../config';
import { getCached, CACHE_KEYS } from '../cache';
import {
  chunk,
  executeBatches,
  withSpinner,
  aggregateErrors,
  allSucceeded,
  getFailures,
  type BatchResult,
} from '../batch-executor';
import { join } from 'path';
import { fileURLToPath } from 'url';

// ============ Batching Configuration ============

const VALIDATION_BATCH_SIZE = 15; // Issues per batch

// ============ Validation Prompt (using unified cache) ============

const DEFAULT_VALIDATION_PROMPT = `You are a code review validation agent. Your task is to validate issues found by other agents and filter out false positives.

You may include your analysis and reasoning, but MUST include a JSON array of valid issues somewhere in your response.
Be strict but fair. Only filter out clear false positives.`;

async function loadValidationPrompt(): Promise<string> {
  return getCached(CACHE_KEYS.VALIDATION_PROMPT, async () => {
    try {
      const __filename = fileURLToPath(import.meta.url);
      const promptPath = join(__filename, '..', '..', 'defaults', 'prompts', 'validation.md');
      return await Bun.file(promptPath).text();
    } catch {
      return DEFAULT_VALIDATION_PROMPT;
    }
  });
}

// ============ Helper Functions ============

/**
 * Select executor for validation from config or first enabled
 */
async function selectExecutor(
  context: PipelineContext
): Promise<AgentExecutor | null> {
  const config = await loadConfig();
  const executors = executorFactory.listExecutors();

  let executor: AgentExecutor | undefined;

  // Check if specific executor is configured for validation
  if (config.validation?.executor) {
    executor = executors.find((e) => e.name === config.validation.executor && e.enabled);
    if (!executor) {
      if (!context.quiet) {
        log.warn(
          `Configured validation executor '${config.validation.executor}' not found or disabled, using default`
        );
      }
    }
  }

  // Fall back to first enabled executor
  if (!executor) {
    executor = executors.find((e) => e.enabled);
  }

  if (!executor) {
    if (!context.quiet) {
      log.warn('No enabled executor found for validation, skipping validation');
    }
    return null;
  }

  // Apply model override if configured (only for executors that support it)
  if (config.validation?.model && (executor.type === 'llm-api' || executor.type === 'cli')) {
    return { ...executor, model: config.validation.model };
  }

  return executor;
}

/**
 * Execute validation for a single batch of issues
 */
async function executeValidationBatch(
  batch: Issue[],
  batchIdx: number,
  totalBatches: number,
  executor: AgentExecutor,
  validationPrompt: string,
  context: PipelineContext
): Promise<BatchResult<Issue[]>> {
  // Convert batch to JSON
  const issuesJson = JSON.stringify(batch, null, 2);

  // Create a dummy Agent for validation
  const validationAgent: Agent = {
    name: 'validation-agent',
    description: 'Validates issues found by other agents',
    systemPrompt: validationPrompt,
    enabled: true,
    order: 999,
    executor: executor.name,
  };

  // Create execution context
  const execContext: ExecutionContext = {
    agent: validationAgent,
    executor: executor,
    input: issuesJson,
    systemPrompt: validationPrompt,
    verbose: context.verbose,
    quiet: context.quiet,
  };

  // Show verbose info before execution
  if (context.verbose && !context.quiet) {
    const needsBatching = totalBatches > 1;
    log.plain(
      `\nValidation prompt${needsBatching ? ` (batch ${batchIdx + 1}/${totalBatches})` : ''}:`
    );
    log.plain(`   Executor: ${executor.name}`);
    log.plain(`   Issues to validate: ${batch.length}`);
    log.plain('─'.repeat(80));
    log.plain(`${validationPrompt}\n\n# Input:\n<issues JSON ${issuesJson.length} chars>`);
    log.plain('─'.repeat(80));
    log.newline();
  }

  return withSpinner(
    {
      label: 'Validating',
      batchIndex: batchIdx,
      totalBatches,
      itemCount: batch.length,
    },
    context.quiet ?? false,
    async () => {
      const result = await executorFactory.executeAgent(execContext);

      if (!result.success) {
        return { success: false, data: [], error: result.error };
      }

      // Parse validated issues from this batch (no agent override, preserve original)
      const batchValidatedIssues = parseIssues(result.output);
      return { success: true, data: batchValidatedIssues };
    },
    (issues, duration) =>
      totalBatches > 1
        ? `Validated batch ${batchIdx + 1}/${totalBatches} (${issues.length} valid, ${duration}ms)`
        : `Validated ${issues.length} issue(s) (${duration}ms)`,
    (error) =>
      totalBatches > 1
        ? `Validation failed (batch ${batchIdx + 1}): ${error}`
        : `Validation failed: ${error}`
  );
}

/**
 * Filter context.results to keep only issues that validator confirmed as valid.
 * Uses file:lineStart:lineEnd as key since agent field may not be preserved by parseIssues.
 */
function filterByValidated(
  results: { issues: Issue[] }[],
  validatedIssues: Issue[]
): void {
  const validatedIssueSet = new Set(
    validatedIssues.map(
      (issue) => `${issue.file}:${issue.lineStart}:${issue.lineEnd}`
    )
  );

  results.forEach((result) => {
    result.issues = result.issues.filter((issue) => {
      const key = `${issue.file}:${issue.lineStart}:${issue.lineEnd}`;
      return validatedIssueSet.has(key);
    });
  });
}


/**
 * Create validation stage
 */
export function createValidationStage(): Stage {
  return {
    id: 'validation',
    name: 'Validation',
    description: 'Validate issues and filter out false positives',
    enabled: true,
    order: 5,
    execute: async (context: PipelineContext): Promise<StageResult> => {
      const startTime = Date.now();

      // Skip validation if requested
      if (context.skipValidation) {
        if (!context.quiet) {
          log.sync('Skipping validation (--skip-validation)');
        }
        return {
          stageId: 'validation',
          stageName: 'Validation',
          success: true,
          duration: Date.now() - startTime,
        };
      }

      // Collect all issues from all results
      const allIssues: Issue[] = [];
      context.results.forEach((result) => {
        allIssues.push(...result.issues);
      });

      if (allIssues.length === 0) {
        if (!context.quiet) {
          log.sync('No issues to validate');
        }
        return {
          stageId: 'validation',
          stageName: 'Validation',
          success: true,
          duration: Date.now() - startTime,
        };
      }

      // Select executor for validation
      const finalExecutor = await selectExecutor(context);
      if (!finalExecutor) {
        return {
          stageId: 'validation',
          stageName: 'Validation',
          success: true,
          duration: Date.now() - startTime,
        };
      }

      // Load validation prompt from file
      const validationPrompt = await loadValidationPrompt();

      // Split into batches if needed
      const batches = chunk(allIssues, VALIDATION_BATCH_SIZE);
      const needsBatching = batches.length > 1;

      // Get model from executor
      const executorModel =
        finalExecutor.type === 'llm-api' || finalExecutor.type === 'cli'
          ? finalExecutor.model
          : undefined;

      if (!context.quiet) {
        if (needsBatching) {
          log.sync(`Validating ${allIssues.length} issues in ${batches.length} batches...`);
        } else {
          log.sync(`Validating ${allIssues.length} issue(s)...`);
        }
        if (context.verbose) {
          log.plain(`   Executor: ${finalExecutor.name}${executorModel ? ` (model: ${executorModel})` : ''}`);
        }
      }

      try {
        // Validate all batches in parallel with concurrency limit
        const batchResults = await executeBatches(
          batches,
          (batch, batchIdx, totalBatches) =>
            executeValidationBatch(
              batch,
              batchIdx,
              totalBatches,
              finalExecutor,
              validationPrompt,
              context
            ),
          { concurrency: context.concurrency, quiet: context.quiet }
        );

        // Check for failures
        if (!allSucceeded(batchResults)) {
          const failures = getFailures(batchResults);
          const stageError = aggregateErrors(failures.map((f) => f.error));
          return {
            stageId: 'validation',
            stageName: 'Validation',
            success: false,
            duration: Date.now() - startTime,
            error: stageError,
          };
        }

        // Merge all validated issues and filter context.results
        const validatedIssues = batchResults.flatMap((r) => r.data);
        filterByValidated(context.results, validatedIssues);

        const validCount = validatedIssues.length;
        const invalidCount = allIssues.length - validCount;
        const duration = Date.now() - startTime;

        // Log final summary
        if (!context.quiet) {
          log.done(`Validation complete: ${validCount} valid, ${invalidCount} filtered out (${duration}ms)`);
        }

        return {
          stageId: 'validation',
          stageName: 'Validation',
          success: true,
          duration,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (!context.quiet) {
          log.error(`Validation error: ${errorMessage}`);
        }
        return {
          stageId: 'validation',
          stageName: 'Validation',
          success: false,
          duration: Date.now() - startTime,
          error: errorMessage,
        };
      }
    },
  };
}
