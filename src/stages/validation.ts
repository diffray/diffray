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
import { executorFactory } from '../executors/index';
import { join } from 'path';
import { fileURLToPath } from 'url';

// ============ Validation Prompt (cached) ============

let validationPromptCache: string | null = null;

const DEFAULT_VALIDATION_PROMPT = `You are a code review validation agent. Your task is to validate issues found by other agents and filter out false positives.

Return ONLY a JSON array of valid issues. Do not include any explanatory text, just the JSON array.
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
        agentId: item.agentId || 'unknown',
        agentName: item.agentName || 'Unknown Agent',
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

      if (!context.quiet) {
        log.sync(`Validating ${allIssues.length} issue(s)...`);
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

      // Create spinner for validation (only if not in quiet mode)
      const spinner: Spinner | null = context.quiet
        ? null
        : new Spinner(`Validating ${allIssues.length} issue(s)...`);

      try {
        // Load validation prompt from file
        const validationPrompt = await loadValidationPrompt();

        // Convert issues to JSON
        const issuesJson = JSON.stringify(allIssues, null, 2);

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
          log.plain(`\nValidation prompt:`);
          log.plain(`   Executor: ${executor.name}`);
          log.plain(`   Issues to validate: ${allIssues.length}`);
          log.plain('─'.repeat(80));
          log.plain(`${validationPrompt}\n\n# Input:\n${issuesJson}`);
          log.plain('─'.repeat(80));
          log.newline();
        }

        // Start spinner
        if (spinner) {
          spinner.start();
        }

        // Execute validation
        const result = await executorFactory.executeAgent(execContext);

        if (!result.success) {
          if (spinner) {
            spinner.fail(`Validation failed: ${result.error}`);
          }
          return {
            stageId: 'validation',
            stageName: 'Validation',
            success: false,
            duration: Date.now() - startTime,
            error: result.error,
          };
        }

        // Parse validated issues from JSON output
        const validatedIssues = parseValidatedIssues(result.output);

        // Update results with validated issues
        const validatedIssueSet = new Set(
          validatedIssues.map(
            (issue) => `${issue.file}:${issue.lineStart}:${issue.lineEnd}:${issue.agentId}`
          )
        );

        context.results.forEach((result) => {
          result.issues = result.issues.filter((issue) => {
            const key = `${issue.file}:${issue.lineStart}:${issue.lineEnd}:${issue.agentId}`;
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
