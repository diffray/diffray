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
import { log, Spinner } from '../logger';
import { executorFactory } from '../executors';
import { loadConfig } from '../config';
import { getCached, CACHE_KEYS } from '../cache';
import { createLimiter } from '../concurrency';
import { join } from 'path';
import { fileURLToPath } from 'url';

// ============ Batching Configuration ============

const VALIDATION_BATCH_SIZE = 15; // Issues per batch

function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

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

      // Get executor from config or use first enabled
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
        return {
          stageId: 'validation',
          stageName: 'Validation',
          success: true,
          duration: Date.now() - startTime,
        };
      }

      // Apply model override if configured (only for executors that support it)
      let finalExecutor: AgentExecutor = executor;
      if (config.validation?.model && (executor.type === 'llm-api' || executor.type === 'cli')) {
        finalExecutor = { ...executor, model: config.validation.model };
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

      // Create concurrency limiter
      const limit = createLimiter(context.concurrency);

      try {
        // Validate all batches in parallel with concurrency limit
        const batchResults = await Promise.all(
          batches.map((batch, batchIdx) =>
            limit(async () => {
              const batchSpinner: Spinner | null = context.quiet
                ? null
                : new Spinner(
                    needsBatching
                      ? `Validating batch ${batchIdx + 1}/${batches.length} (${batch.length} issues)...`
                      : `Validating ${batch.length} issue(s)...`
                  );

              try {
                batchSpinner?.start();

                // Convert batch to JSON
                const issuesJson = JSON.stringify(batch, null, 2);

                // Create a dummy Agent for validation
                const validationAgent: Agent = {
                  id: 'validation-agent',
                  name: 'Validation Agent',
                  description: 'Validates issues found by other agents',
                  systemPrompt: validationPrompt,
                  enabled: true,
                  order: 999,
                  executor: finalExecutor.id,
                };

                // Create execution context
                const execContext: ExecutionContext = {
                  agent: validationAgent,
                  executor: finalExecutor,
                  input: issuesJson,
                  systemPrompt: validationPrompt,
                  verbose: context.verbose,
                  quiet: context.quiet,
                };

                if (context.verbose && !context.quiet) {
                  log.plain(
                    `\nValidation prompt${needsBatching ? ` (batch ${batchIdx + 1}/${batches.length})` : ''}:`
                  );
                  log.plain(`   Executor: ${finalExecutor.name}`);
                  log.plain(`   Issues to validate: ${batch.length}`);
                  log.plain('─'.repeat(80));
                  log.plain(`${validationPrompt}\n\n# Input:\n<issues JSON ${issuesJson.length} chars>`);
                  log.plain('─'.repeat(80));
                  log.newline();
                }

                // Execute validation for this batch
                const result = await executorFactory.executeAgent(execContext);

                if (!result.success) {
                  batchSpinner?.fail(
                    `Validation failed${needsBatching ? ` (batch ${batchIdx + 1})` : ''}: ${result.error}`
                  );
                  return { success: false, issues: [], error: result.error };
                }

                // Parse validated issues from this batch (no agent override, preserve original)
                const batchValidatedIssues = parseIssues(result.output);

                batchSpinner?.succeed(
                  needsBatching
                    ? `Validated batch ${batchIdx + 1}/${batches.length} (${batchValidatedIssues.length} valid)`
                    : `Validated ${batchValidatedIssues.length} issue(s)`
                );

                return { success: true, issues: batchValidatedIssues, error: undefined };
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                batchSpinner?.fail(`Validation error (batch ${batchIdx + 1}): ${errorMessage}`);
                return { success: false, issues: [], error: errorMessage };
              } finally {
                batchSpinner?.stop();
              }
            })
          )
        );

        // Check for failures
        const failures = batchResults.filter((r) => !r.success);
        if (failures.length > 0) {
          const errorMessages = failures.map((f) => f.error).filter(Boolean);
          return {
            stageId: 'validation',
            stageName: 'Validation',
            success: false,
            duration: Date.now() - startTime,
            error: errorMessages.join('; '),
          };
        }

        // Merge all validated issues
        const validatedIssues = batchResults.flatMap((r) => r.issues);

        // Update results with validated issues
        // Note: agent excluded from key because parseIssues may not preserve it
        const validatedIssueSet = new Set(
          validatedIssues.map(
            (issue) => `${issue.file}:${issue.lineStart}:${issue.lineEnd}`
          )
        );

        context.results.forEach((result) => {
          result.issues = result.issues.filter((issue) => {
            const key = `${issue.file}:${issue.lineStart}:${issue.lineEnd}`;
            return validatedIssueSet.has(key);
          });
        });

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
