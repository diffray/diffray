/**
 * Stage 5: Validation
 * Validates issues found by agents using an LLM to filter out false positives
 * Uses ID-based approach for reliable issue matching
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
import { log } from '../logger';
import { executorFactory, getExecutor } from '../executors';

// Issue with assigned ID for validation tracking
interface IndexedIssue extends Issue {
  id: number;
}
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
import { loadAgentMarkdown } from '../agents/md-loader';
import { join } from 'path';
import { fileURLToPath } from 'url';

// ============ Batching Configuration ============

const VALIDATION_BATCH_SIZE = 15; // Issues per batch

// ============ Validation Agent Loading ============

const DEFAULT_VALIDATION_AGENT: Agent = {
  name: 'validation',
  description: 'Validates issues found by other agents',
  systemPrompt: `You are a code review validation agent. Your task is to validate issues found by other agents and filter out false positives.

You may include your analysis and reasoning, but MUST include a JSON array of valid issues somewhere in your response.
Be strict but fair. Only filter out clear false positives.`,
  enabled: true,
  order: 999,
  executor: 'claude-cli',
  executorSettings: { model: 'opus', timeout: 180 },
};

/**
 * Load validation agent from MD file or use default
 */
async function loadValidationAgent(): Promise<Agent> {
  return getCached(CACHE_KEYS.VALIDATION_PROMPT, async () => {
    try {
      const __filename = fileURLToPath(import.meta.url);
      const agentPath = join(__filename, '..', '..', 'defaults', 'agents', 'validation.md');
      const agents = await loadAgentMarkdown(agentPath);
      return agents[0] ?? DEFAULT_VALIDATION_AGENT;
    } catch {
      return DEFAULT_VALIDATION_AGENT;
    }
  });
}

// ============ Helper Functions ============

/**
 * Format issues for validation in XML/Markdown format with IDs
 */
function formatIssuesForValidation(issues: IndexedIssue[]): string {
  return issues
    .map((issue) => {
      const lines = [
        `<issue id="${issue.id}">`,
        `**[${issue.severity.toUpperCase()}] ${issue.category}** in \`${issue.file}:${issue.lineStart}-${issue.lineEnd}\``,
        `Agent: ${issue.agent}`,
        '',
        `**Problem:** ${issue.shortDescription}`,
        '',
        issue.fullDescription,
      ];

      if (issue.suggestion) {
        lines.push('', `**Suggestion:** ${issue.suggestion}`);
      }

      lines.push('</issue>');
      return lines.join('\n');
    })
    .join('\n\n');
}

/**
 * Normalize file path for comparison (handle different path formats)
 */
function normalizeFilePath(filePath: string): string {
  return filePath
    .replace(/\\/g, '/') // Windows to Unix
    .replace(/^\.\//, '') // Remove leading ./
    .toLowerCase();
}

/**
 * Check if two line ranges overlap or are close
 */
function linesOverlapOrClose(
  line1Start: number,
  line1End: number,
  line2Start: number,
  line2End: number,
  tolerance: number = 5
): boolean {
  // Check if ranges overlap
  if (line1Start <= line2End && line2Start <= line1End) {
    return true;
  }
  // Check if ranges are within tolerance
  return (
    Math.abs(line1Start - line2Start) <= tolerance ||
    Math.abs(line1End - line2End) <= tolerance ||
    Math.abs(line1Start - line2End) <= tolerance ||
    Math.abs(line1End - line2Start) <= tolerance
  );
}

/**
 * Calculate similarity score between two issues (0-100)
 */
function calculateIssueSimilarity(
  original: IndexedIssue,
  returned: { file?: string; lineStart?: number; lineEnd?: number; shortDescription?: string }
): number {
  let score = 0;

  // File match (required - 40 points)
  if (returned.file) {
    const normalizedOriginal = normalizeFilePath(original.file);
    const normalizedReturned = normalizeFilePath(returned.file);
    if (normalizedOriginal === normalizedReturned) {
      score += 40;
    } else if (
      normalizedOriginal.endsWith(normalizedReturned) ||
      normalizedReturned.endsWith(normalizedOriginal)
    ) {
      score += 30; // Partial path match
    } else {
      return 0; // File must match at least partially
    }
  } else {
    return 0;
  }

  // Line range match (30 points)
  if (typeof returned.lineStart === 'number') {
    const returnedEnd = returned.lineEnd ?? returned.lineStart;
    if (linesOverlapOrClose(original.lineStart, original.lineEnd, returned.lineStart, returnedEnd)) {
      score += 30;
    } else if (Math.abs(original.lineStart - returned.lineStart) <= 20) {
      score += 15; // Within 20 lines
    }
  }

  // Description similarity (30 points)
  if (returned.shortDescription && original.shortDescription) {
    const origWords = new Set(original.shortDescription.toLowerCase().split(/\W+/).filter(w => w.length > 3));
    const retWords = new Set(returned.shortDescription.toLowerCase().split(/\W+/).filter(w => w.length > 3));
    const intersection = [...origWords].filter(w => retWords.has(w));
    const similarity = intersection.length / Math.max(origWords.size, retWords.size, 1);
    score += Math.round(similarity * 30);
  }

  return score;
}

/**
 * Parse validated issue IDs from validator output
 * Expects format: <valid-ids>[1, 2, 3]</valid-ids>
 * Falls back to matching issues from <json> format if validator returns full issues
 */
function parseValidatedIds(output: string, batch?: IndexedIssue[]): number[] {
  // Try <valid-ids>...</valid-ids> format first
  const tagMatch = output.match(/<valid-ids>\s*(\[[\s\S]*?\])\s*<\/valid-ids>/);
  if (tagMatch?.[1]) {
    try {
      const ids = JSON.parse(tagMatch[1]);
      if (Array.isArray(ids) && ids.every((id) => typeof id === 'number')) {
        return ids;
      }
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback: find any JSON array of numbers (e.g., [1, 2, 3])
  const arrayMatch = output.match(/\[\s*(\d+\s*(?:,\s*\d+\s*)*)\]/);
  if (arrayMatch?.[1]) {
    try {
      const ids = JSON.parse(`[${arrayMatch[1]}]`);
      if (Array.isArray(ids)) {
        const validIds = ids.filter((id) => typeof id === 'number');
        if (validIds.length > 0) {
          return validIds;
        }
      }
    } catch {
      // Fall through to JSON fallback
    }
  }

  // Fallback: try <json>...</json> format with issue objects
  // Use fuzzy matching to find original issues
  if (batch && batch.length > 0) {
    const jsonTagMatch = output.match(/<json>\s*([\s\S]*?)\s*<\/json>/);
    if (jsonTagMatch?.[1]) {
      try {
        const issues = JSON.parse(jsonTagMatch[1]);
        if (Array.isArray(issues) && issues.length > 0) {
          const matchedIds = new Set<number>();

          for (const returnedIssue of issues) {
            // Find best matching original issue using similarity scoring
            let bestMatch: IndexedIssue | null = null;
            let bestScore = 0;

            for (const indexed of batch) {
              // Skip already matched issues
              if (matchedIds.has(indexed.id)) continue;

              const score = calculateIssueSimilarity(indexed, returnedIssue);
              if (score > bestScore && score >= 40) {
                // Minimum 40 points (file must match)
                bestScore = score;
                bestMatch = indexed;
              }
            }

            if (bestMatch) {
              matchedIds.add(bestMatch.id);
            }
          }

          if (matchedIds.size > 0) {
            return Array.from(matchedIds);
          }
        }
      } catch {
        // JSON parse failed
      }
    }
  }

  return [];
}

/**
 * Filter context.results keeping only issues with valid IDs
 */
function filterByIds(
  results: { issues: Issue[] }[],
  validIds: Set<number>,
  issueIdMap: Map<Issue, number>
): void {
  results.forEach((result) => {
    result.issues = result.issues.filter((issue) => {
      const id = issueIdMap.get(issue);
      return id !== undefined && validIds.has(id);
    });
  });
}

/**
 * Get executor for validation agent with settings applied
 */
function getValidationExecutor(
  agent: Agent,
  context: PipelineContext
): AgentExecutor | null {
  const executor = getExecutor(agent.executor);

  if (!executor || !executor.enabled) {
    if (!context.quiet) {
      log.warn(`Validation executor '${agent.executor}' not found or disabled, skipping validation`);
    }
    return null;
  }

  // Apply agent's executorSettings if present
  if (agent.executorSettings && executor.applySettings) {
    return executor.applySettings(agent.executorSettings);
  }

  return executor.getInfo();
}

/**
 * Execute validation for a single batch of issues
 * Returns array of valid issue IDs
 */
async function executeValidationBatch(
  batch: IndexedIssue[],
  batchIdx: number,
  totalBatches: number,
  validationAgent: Agent,
  executor: AgentExecutor,
  context: PipelineContext
): Promise<BatchResult<number[]>> {
  // Format issues as XML/Markdown with IDs
  const issuesFormatted = formatIssuesForValidation(batch);

  // Build repository context
  const repoPath = context.metadata.repository;

  // Format commit messages if available
  const commitMessagesSection = context.metadata.commitMessages?.length
    ? [
        '',
        '## Commit Messages (IMPORTANT: Check these to understand change intent!)',
        'These messages explain WHY the changes were made. Use them to identify INTENTIONAL trade-offs.',
        '',
        ...context.metadata.commitMessages.map((msg, i) => `### Commit ${i + 1}:\n${msg}`),
      ].join('\n')
    : null;

  const repoContext = [
    `# Repository Context`,
    `Base path: ${repoPath}`,
    `All file paths below are relative to this directory.`,
    `When using tools to read files, prepend this base path to get absolute paths.`,
    context.metadata.baseRef ? `Base ref: ${context.metadata.baseRef}` : null,
    context.metadata.headRef ? `Head ref: ${context.metadata.headRef}` : null,
    commitMessagesSection,
  ].filter(Boolean).join('\n');

  // Combine repository context with formatted issues
  const inputWithContext = `${repoContext}\n\n# Issues to validate (${batch.length} total):\n\n${issuesFormatted}`;

  // Create execution context
  const execContext: ExecutionContext = {
    agent: validationAgent,
    executor: executor,
    input: inputWithContext,
    systemPrompt: validationAgent.systemPrompt,
    verbose: context.verbose,
    quiet: context.quiet,
    cwd: repoPath,
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
    log.plain(inputWithContext.slice(0, 2000) + (inputWithContext.length > 2000 ? '...' : ''));
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

      // Parse validated IDs from response
      // Pass batch to support fallback matching when validator returns <json> format
      const validIds = parseValidatedIds(result.output, batch);
      return { success: true, data: validIds };
    },
    (ids, duration) =>
      totalBatches > 1
        ? `Validated batch ${batchIdx + 1}/${totalBatches} (${ids.length} valid, ${duration}ms)`
        : `Validated ${ids.length} issue(s) (${duration}ms)`,
    (error) =>
      totalBatches > 1
        ? `Validation failed (batch ${batchIdx + 1}): ${error}`
        : `Validation failed: ${error}`
  );
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

      // Collect all issues from all results and assign IDs
      const allIssues: Issue[] = [];
      const issueIdMap = new Map<Issue, number>();

      context.results.forEach((result) => {
        result.issues.forEach((issue) => {
          const id = allIssues.length + 1;
          allIssues.push(issue);
          issueIdMap.set(issue, id);
        });
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

      // Create indexed issues for validation
      const indexedIssues: IndexedIssue[] = allIssues.map((issue, i) => ({
        ...issue,
        id: i + 1,
      }));

      // Load validation agent from MD file
      const validationAgent = await loadValidationAgent();

      // Get executor for validation (with agent's executorSettings applied)
      const finalExecutor = getValidationExecutor(validationAgent, context);
      if (!finalExecutor) {
        return {
          stageId: 'validation',
          stageName: 'Validation',
          success: true,
          duration: Date.now() - startTime,
        };
      }

      // Split into batches if needed
      const batches = chunk(indexedIssues, VALIDATION_BATCH_SIZE);
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
              validationAgent,
              finalExecutor,
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

        // Collect all valid IDs and filter context.results
        const validIds = new Set(batchResults.flatMap((r) => r.data));
        filterByIds(context.results, validIds, issueIdMap);

        const validCount = validIds.size;
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