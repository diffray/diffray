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
  IssueSeverity,
} from '../types';
import { log, Spinner } from '../logger';
import { executorFactory } from '../executors';
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

// ============ Validation Prompt (cached) ============

let validationPromptCache: string | null = null;

const DEFAULT_VALIDATION_PROMPT = `You are a code review validation agent. Your task is to validate issues found by other agents and filter out false positives.

You may include your analysis and reasoning, but MUST include a JSON array of valid issues somewhere in your response.
Be strict but fair. Only filter out clear false positives.`;

async function loadValidationPrompt(): Promise<string> {
  if (validationPromptCache) return validationPromptCache;
  try {
    const __filename = fileURLToPath(import.meta.url);
    const promptPath = join(__filename, '..', '..', 'defaults', 'prompts', 'validation.md');
    validationPromptCache = await Bun.file(promptPath).text();
    return validationPromptCache;
  } catch {
    return DEFAULT_VALIDATION_PROMPT;
  }
}

/**
 * Parse validated issues from agent output
 * Expects a JSON array of issues
 */
function parseValidatedIssues(output: string): Issue[] {
  try {
    // Extract JSON from output (in case there's extra text)
    const jsonMatch = output.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [];
    }

    const data = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(data)) {
      return [];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[])
      .map((item) => ({
        file: item.file || '',
        lineStart: item.lineStart || item.line || 0,
        lineEnd: item.lineEnd || item.lineStart || item.line || 0,
        severity: (item.severity || 'info') as IssueSeverity,
        shortDescription: item.shortDescription || item.short || item.message || '',
        fullDescription: item.fullDescription || item.description || item.shortDescription || '',
        suggestion: item.suggestion,
        agent: item.agent || 'unknown',
      }))
      .filter((issue: Issue) => issue.file && issue.shortDescription && issue.lineStart > 0);
  } catch {
    return [];
  }
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

      // Get the first enabled executor
      const executors = executorFactory.listExecutors();
      const executor = executors.find((e) => e.enabled);

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

      // Load validation prompt from file
      const validationPrompt = await loadValidationPrompt();

      // Split into batches if needed
      const batches = chunk(allIssues, VALIDATION_BATCH_SIZE);
      const needsBatching = batches.length > 1;

      if (!context.quiet) {
        if (needsBatching) {
          log.sync(`Validating ${allIssues.length} issues in ${batches.length} batches...`);
        } else {
          log.sync(`Validating ${allIssues.length} issue(s)...`);
        }
      }

      // Create spinner for validation (only if not in quiet mode)
      const spinner: Spinner | null = context.quiet
        ? null
        : new Spinner(`Validating ${allIssues.length} issue(s)...`);

      try {
        // Start spinner
        if (spinner) {
          spinner.start();
        }

        // Validate all batches
        const allValidatedIssues: Issue[] = [];

        for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
          const batch = batches[batchIdx]!;

          // Update spinner for batch progress
          if (spinner && needsBatching) {
            spinner.update(
              `Validating batch ${batchIdx + 1}/${batches.length} (${batch.length} issues)...`
            );
          }

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
            executor: executor.id,
          };

          // Create execution context
          const execContext: ExecutionContext = {
            agent: validationAgent,
            executor,
            input: issuesJson,
            systemPrompt: validationPrompt,
            verbose: context.verbose,
          };

          if (context.verbose && !context.quiet) {
            log.plain(
              `\nValidation prompt${needsBatching ? ` (batch ${batchIdx + 1}/${batches.length})` : ''}:`
            );
            log.plain(`   Executor: ${executor.name}`);
            log.plain(`   Issues to validate: ${batch.length}`);
            log.plain('─'.repeat(80));
            log.plain(`${validationPrompt}\n\n# Input:\n<issues JSON ${issuesJson.length} chars>`);
            log.plain('─'.repeat(80));
            log.newline();
          }

          // Execute validation for this batch
          const result = await executorFactory.executeAgent(execContext);

          if (!result.success) {
            if (spinner) {
              spinner.fail(
                `Validation failed${needsBatching ? ` (batch ${batchIdx + 1})` : ''}: ${result.error}`
              );
            }
            return {
              stageId: 'validation',
              stageName: 'Validation',
              success: false,
              duration: Date.now() - startTime,
              error: result.error,
            };
          }

          // Parse validated issues from this batch
          const batchValidatedIssues = parseValidatedIssues(result.output);
          allValidatedIssues.push(...batchValidatedIssues);
        }

        // Merge all validated issues
        const validatedIssues = allValidatedIssues;

        // Update results with validated issues
        const validatedIssueSet = new Set(
          validatedIssues.map(
            (issue) => `${issue.file}:${issue.lineStart}:${issue.lineEnd}:${issue.agent}`
          )
        );

        context.results.forEach((result) => {
          result.issues = result.issues.filter((issue) => {
            const key = `${issue.file}:${issue.lineStart}:${issue.lineEnd}:${issue.agent}`;
            return validatedIssueSet.has(key);
          });
        });

        const validCount = validatedIssues.length;
        const invalidCount = allIssues.length - validCount;

        // Stop spinner with success message
        const duration = Date.now() - startTime;
        if (spinner) {
          spinner.succeed(
            `Validation complete: ${validCount} valid, ${invalidCount} filtered out (${duration}ms)`
          );
        }

        return {
          stageId: 'validation',
          stageName: 'Validation',
          success: true,
          duration,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        spinner?.fail(`Validation error: ${errorMessage}`);
        return {
          stageId: 'validation',
          stageName: 'Validation',
          success: false,
          duration: Date.now() - startTime,
          error: errorMessage,
        };
      } finally {
        spinner?.stop();
      }
    },
  };
}
