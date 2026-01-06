/**
 * Stage 5: Validation
 * Validates issues found by agents using an LLM to filter out false positives
 */

import type { Stage, StageResult, PipelineContext, Issue, ExecutionContext, SubAgent, IssueSeverity } from "../types";
import { log, Spinner } from "../logger";
import { executorFactory } from "../executors/factory";

/**
 * System prompt for validation agent
 */
const VALIDATION_SYSTEM_PROMPT = `You are a code review validation agent. Your task is to validate issues found by other agents and filter out false positives.

You will receive a JSON array of issues. Each issue has:
- file: the file path
- lineStart, lineEnd: the line range
- severity: error, warning, info, or suggestion
- shortDescription: brief description
- fullDescription: detailed description
- suggestion: optional suggestion for fixing
- agentId, agentName: which agent found this issue

Your job is to:
1. Analyze each issue carefully
2. Determine if it's a valid issue or a false positive
3. Return ONLY the valid issues in the same JSON format

Return ONLY a JSON array of valid issues. Do not include any explanatory text, just the JSON array.

Example input:
[
  {
    "file": "src/example.ts",
    "lineStart": 10,
    "lineEnd": 15,
    "severity": "error",
    "shortDescription": "Unused variable",
    "fullDescription": "Variable 'x' is declared but never used",
    "suggestion": "Remove the unused variable",
    "agentId": "typescript-agent",
    "agentName": "TypeScript Agent"
  }
]

Example output (if valid):
[
  {
    "file": "src/example.ts",
    "lineStart": 10,
    "lineEnd": 15,
    "severity": "error",
    "shortDescription": "Unused variable",
    "fullDescription": "Variable 'x' is declared but never used",
    "suggestion": "Remove the unused variable",
    "agentId": "typescript-agent",
    "agentName": "TypeScript Agent"
  }
]

Example output (if invalid):
[]

Be strict but fair. Only filter out clear false positives.`;

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

    return data.map((item: any) => ({
      file: item.file || "",
      lineStart: item.lineStart || item.line || 0,
      lineEnd: item.lineEnd || item.lineStart || item.line || 0,
      severity: (item.severity || "info") as IssueSeverity,
      shortDescription: item.shortDescription || item.short || item.message || "",
      fullDescription: item.fullDescription || item.description || item.shortDescription || "",
      suggestion: item.suggestion,
      agentId: item.agentId || "unknown",
      agentName: item.agentName || "Unknown Agent",
    })).filter((issue: Issue) => issue.file && issue.shortDescription && issue.lineStart > 0);
  } catch (error) {
    return [];
  }
}

/**
 * Create validation stage
 */
export function createValidationStage(): Stage {
  return {
    id: "validation",
    name: "Validation",
    description: "Validate issues and filter out false positives",
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
          log.sync("No issues to validate");
        }
        return {
          stageId: "validation",
          stageName: "Validation",
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
          log.warn("No enabled executor found for validation, skipping validation");
        }
        return {
          stageId: "validation",
          stageName: "Validation",
          success: true,
          duration: Date.now() - startTime,
        };
      }

      // Create spinner for validation (only if not in quiet mode)
      const spinner: Spinner | null = context.quiet ? null : new Spinner(`Validating ${allIssues.length} issue(s)...`);

      try {
        // Convert issues to JSON
        const issuesJson = JSON.stringify(allIssues, null, 2);

        // Create a dummy SubAgent for validation
        const validationSubAgent: SubAgent = {
          id: "validation-agent",
          name: "Validation Agent",
          description: "Validates issues found by other agents",
          systemPrompt: VALIDATION_SYSTEM_PROMPT,
          enabled: true,
          order: 999,
          executorId: executor.id,
        };

        // Create execution context
        const execContext: ExecutionContext = {
          subAgent: validationSubAgent,
          executor,
          input: issuesJson,
          systemPrompt: VALIDATION_SYSTEM_PROMPT,
          verbose: context.verbose,
        };

        if (context.verbose && !context.quiet) {
          log.plain(`\n📝 Validation prompt:`);
          log.plain(`   Executor: ${executor.name}`);
          log.plain(`   Issues to validate: ${allIssues.length}`);
          log.plain("─".repeat(80));
          log.plain(`${VALIDATION_SYSTEM_PROMPT}\n\n# Input:\n${issuesJson}`);
          log.plain("─".repeat(80));
          log.newline();
        }

        // Start spinner
        if (spinner) {
          spinner.start();
        }

        // Execute validation
        const result = await executorFactory.executeSubAgent(execContext);

        if (!result.success) {
          if (spinner) {
            spinner.fail(`Validation failed: ${result.error}`);
          }
          return {
            stageId: "validation",
            stageName: "Validation",
            success: false,
            duration: Date.now() - startTime,
            error: result.error,
          };
        }

        // Parse validated issues from JSON output
        const validatedIssues = parseValidatedIssues(result.output);

        // Update results with validated issues
        const validatedIssueSet = new Set(
          validatedIssues.map((issue) => `${issue.file}:${issue.lineStart}:${issue.lineEnd}:${issue.agentId}`)
        );

        let totalRemoved = 0;
        context.results.forEach((result) => {
          const beforeCount = result.issues.length;
          result.issues = result.issues.filter((issue) => {
            const key = `${issue.file}:${issue.lineStart}:${issue.lineEnd}:${issue.agentId}`;
            return validatedIssueSet.has(key);
          });
          totalRemoved += beforeCount - result.issues.length;
        });

        const validCount = validatedIssues.length;
        const invalidCount = allIssues.length - validCount;

        // Stop spinner with success message
        const duration = Date.now() - startTime;
        if (spinner) {
          spinner.succeed(`Validation complete: ${validCount} valid, ${invalidCount} filtered out (${duration}ms)`);
        }

        return {
          stageId: "validation",
          stageName: "Validation",
          success: true,
          duration,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (spinner) {
          spinner.fail(`Validation error: ${errorMessage}`);
        }
        return {
          stageId: "validation",
          stageName: "Validation",
          success: false,
          duration: Date.now() - startTime,
          error: errorMessage,
        };
      }
    },
  };
}

