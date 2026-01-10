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
import { log, MultiProgress } from '../logger';
import { executorFactory, getExecutor } from '../executors';
import { createLimiter } from '../concurrency';

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
import { loadAgents } from '../agents';

// ============ Configuration ============

const VALIDATION_BATCH_SIZE = 10; // Issues per batch

// Similarity scoring weights (total = 100)
// These weights determine how much each attribute contributes to issue matching
const SIMILARITY_SCORE = {
  FILE_EXACT_MATCH: 40, // Full file path matches exactly
  FILE_PARTIAL_MATCH: 30, // File path ends with or contains the other
  LINE_OVERLAP: 30, // Line ranges overlap or are within tolerance
  LINE_NEARBY: 15, // Lines within extended tolerance (fallback)
  DESCRIPTION: 30, // Word overlap in descriptions
} as const;

// Thresholds for similarity matching
const SIMILARITY_THRESHOLD = {
  MINIMUM_SCORE: 40, // Minimum score to consider a match (file must match)
  LINE_TOLERANCE: 5, // Lines within this range count as overlapping
  LINE_EXTENDED_TOLERANCE: 20, // Extended range for partial line match score
} as const;

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
 * Load validation agent from MD files with priority (project > user > defaults)
 * Looks for agent with name 'validation' or stage: 'validation'
 */
async function loadValidationAgent(projectPath: string): Promise<Agent> {
  return getCached(CACHE_KEYS.VALIDATION_PROMPT, async () => {
    try {
      const allAgents = await loadAgents({ projectPath });
      // Find validation agent by name or stage
      const validationAgent = allAgents.find(
        (a) => a.name === 'validation' || a.stage === 'validation'
      );
      return validationAgent ?? DEFAULT_VALIDATION_AGENT;
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
 * Check if two line ranges overlap or are within tolerance
 */
function linesOverlapOrClose(
  line1Start: number,
  line1End: number,
  line2Start: number,
  line2End: number,
  tolerance: number = SIMILARITY_THRESHOLD.LINE_TOLERANCE
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
 * Score breakdown: file match + line match + description match
 */
function calculateIssueSimilarity(
  original: IndexedIssue,
  returned: { file?: string; lineStart?: number; lineEnd?: number; shortDescription?: string }
): number {
  let score = 0;

  // File match (required for any match)
  if (!returned.file) {
    return 0;
  }

  const normalizedOriginal = normalizeFilePath(original.file);
  const normalizedReturned = normalizeFilePath(returned.file);

  if (normalizedOriginal === normalizedReturned) {
    score += SIMILARITY_SCORE.FILE_EXACT_MATCH;
  } else if (
    normalizedOriginal.endsWith(normalizedReturned) ||
    normalizedReturned.endsWith(normalizedOriginal)
  ) {
    score += SIMILARITY_SCORE.FILE_PARTIAL_MATCH;
  } else {
    return 0; // File must match at least partially
  }

  // Line range match
  if (typeof returned.lineStart === 'number') {
    const returnedEnd = returned.lineEnd ?? returned.lineStart;
    if (
      linesOverlapOrClose(original.lineStart, original.lineEnd, returned.lineStart, returnedEnd)
    ) {
      score += SIMILARITY_SCORE.LINE_OVERLAP;
    } else if (
      Math.abs(original.lineStart - returned.lineStart) <=
      SIMILARITY_THRESHOLD.LINE_EXTENDED_TOLERANCE
    ) {
      score += SIMILARITY_SCORE.LINE_NEARBY;
    }
  }

  // Description similarity (word overlap)
  if (returned.shortDescription && original.shortDescription) {
    const minWordLength = 3;
    const origWords = new Set(
      original.shortDescription
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length >= minWordLength)
    );
    const retWords = new Set(
      returned.shortDescription
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length >= minWordLength)
    );
    const intersection = [...origWords].filter((w) => retWords.has(w));
    const similarity = intersection.length / Math.max(origWords.size, retWords.size, 1);
    score += Math.round(similarity * SIMILARITY_SCORE.DESCRIPTION);
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
              if (score > bestScore && score >= SIMILARITY_THRESHOLD.MINIMUM_SCORE) {
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
 * Falls back to context's default executor (from config) if agent doesn't specify one
 */
function getValidationExecutor(
  agent: Agent,
  context: PipelineContext,
  defaultExecutor: string
): AgentExecutor | null {
  const executorName = agent.executor || defaultExecutor;
  const executor = getExecutor(executorName);

  if (!executor || !executor.enabled) {
    if (!context.quiet) {
      log.warn(`Validation executor '${executorName}' not found or disabled, skipping validation`);
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
 * @param progress - Optional MultiProgress for progress tracking (skips withSpinner when provided)
 */
async function executeValidationBatch(
  batch: IndexedIssue[],
  batchIdx: number,
  totalBatches: number,
  validationAgent: Agent,
  executor: AgentExecutor,
  context: PipelineContext,
  progress?: MultiProgress
): Promise<BatchResult<number[]>> {
  // Mark task as running on first batch (when using MultiProgress)
  if (progress && batchIdx === 0) {
    progress.startTask('validation');
  }

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
  ]
    .filter(Boolean)
    .join('\n');

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

  // Core execution logic - shared between progress and spinner paths
  const executeCore = async (): Promise<{ success: boolean; data: number[]; error?: string }> => {
    const result = await executorFactory.executeAgent(execContext);
    if (!result.success) {
      return { success: false, data: [], error: result.error };
    }
    const validIds = parseValidatedIds(result.output, batch);
    return { success: true, data: validIds };
  };

  // Use MultiProgress if available, otherwise fall back to withSpinner
  if (progress) {
    const startTime = Date.now();
    try {
      const result = await executeCore();
      const duration = Date.now() - startTime;

      if (result.success) {
        progress.completeBatch('validation');
      } else {
        progress.failTask('validation');
      }

      return { ...result, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      progress.failTask('validation');

      return { success: false, data: [], error: errorMessage, duration };
    }
  }

  // Fallback to withSpinner for quiet/stream/verbose modes
  return withSpinner(
    {
      label: 'Validating',
      batchIndex: batchIdx,
      totalBatches,
      itemCount: batch.length,
      itemName: 'issue',
    },
    context.quiet ?? false,
    executeCore,
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

      // Load validation agent from MD files (with priority: project > user > defaults)
      const validationAgent = await loadValidationAgent(context.metadata.repository);

      // Get stage settings from config
      const config = context.config!;
      const defaultExecutor = config.executor;
      const executorConfig = config.executors[defaultExecutor] || {};
      const stageSettings = executorConfig.validation || {};
      const batchSize = stageSettings.batchSize ?? VALIDATION_BATCH_SIZE;
      const stageConcurrency = stageSettings.concurrency ?? context.concurrency;

      // Get executor for validation (with agent's executorSettings applied)
      const finalExecutor = getValidationExecutor(validationAgent, context, defaultExecutor);
      if (!finalExecutor) {
        return {
          stageId: 'validation',
          stageName: 'Validation',
          success: true,
          duration: Date.now() - startTime,
        };
      }

      // Split into batches if needed
      const batches = chunk(indexedIssues, batchSize);

      // Get model from executor
      const executorModel =
        finalExecutor.type === 'llm-api' || finalExecutor.type === 'cli'
          ? finalExecutor.model
          : undefined;

      if (!context.quiet) {
        log.sync(`Validating ${allIssues.length} issue(s)...`);
        if (context.verbose) {
          log.plain(
            `   Executor: ${finalExecutor.name}${executorModel ? ` (model: ${executorModel})` : ''}`
          );
        }
      }

      // Create MultiProgress (only when not quiet/stream/verbose)
      const useMultiProgress = !context.quiet && !context.stream && !context.verbose;
      const progress = useMultiProgress ? new MultiProgress() : undefined;

      // Add validation task to progress
      if (progress) {
        progress.addTask(
          'validation',
          'Validation',
          batches.length,
          allIssues.length,
          1, // ruleCount = 1 for validation
          `${allIssues.length} issues`
        );
        progress.start();
      }

      try {
        // Validate all batches
        let batchResults: BatchResult<number[]>[];

        if (progress) {
          // Use MultiProgress version with concurrency limiter
          const limit = createLimiter(stageConcurrency);
          batchResults = await Promise.all(
            batches.map((batch, batchIdx) =>
              limit(() =>
                executeValidationBatch(
                  batch,
                  batchIdx,
                  batches.length,
                  validationAgent,
                  finalExecutor,
                  context,
                  progress
                )
              )
            )
          );
        } else {
          // Fallback to withSpinner version (no progress param)
          batchResults = await executeBatches(
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
            { concurrency: stageConcurrency, quiet: context.quiet }
          );
        }

        // Stop progress display
        progress?.stop();

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
          log.done(
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
        // Stop progress display on error
        progress?.stop();

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
