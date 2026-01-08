/**
 * Batch Executor Utility
 * Common patterns for parallel batch execution with spinner feedback
 */

import { Spinner } from './logger';
import { createLimiter } from './concurrency';

// ============ Types ============

/**
 * Result of a batch execution
 */
export interface BatchResult<T> {
  success: boolean;
  data: T;
  error?: string;
  duration?: number;
}

/**
 * Configuration for batch execution
 */
export interface BatchConfig {
  /** Suppress spinner output */
  quiet?: boolean;
  /** Max concurrent batches */
  concurrency: number;
}

/**
 * Configuration for spinner label formatting
 */
export interface BatchSpinnerConfig {
  /** Label for the operation (e.g., "security-scan" or "Validating") */
  label: string;
  /** 0-based batch index */
  batchIndex: number;
  /** Total number of batches */
  totalBatches: number;
  /** Optional: number of items in this batch */
  itemCount?: number;
}

// ============ Utility Functions ============

/**
 * Split array into chunks of given size
 */
export function chunk<T>(array: T[], size: number): T[][] {
  if (size < 1) {
    throw new Error('Chunk size must be at least 1');
  }
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Format spinner label for batch operations
 * - Single batch: `${label}...` or `${label} (${itemCount} items)...`
 * - Multiple batches: `${label} (batch ${idx+1}/${total})...`
 */
export function formatBatchLabel(config: BatchSpinnerConfig): string {
  const { label, batchIndex, totalBatches, itemCount } = config;

  if (totalBatches === 1) {
    if (itemCount !== undefined) {
      return `${label} (${itemCount} item${itemCount !== 1 ? 's' : ''})...`;
    }
    return `${label}...`;
  }

  const batchPart = `batch ${batchIndex + 1}/${totalBatches}`;
  if (itemCount !== undefined) {
    return `${label} (${batchPart}, ${itemCount} item${itemCount !== 1 ? 's' : ''})...`;
  }
  return `${label} (${batchPart})...`;
}

/**
 * Aggregate batch errors into a single error message
 * - Deduplicates identical errors
 * - If single unique error repeated N times: `${error} (${N} batches)`
 * - Otherwise joins with '; '
 */
export function aggregateErrors(errors: (string | undefined)[]): string | undefined {
  const filteredErrors = errors.filter((e): e is string => Boolean(e));

  if (filteredErrors.length === 0) {
    return undefined;
  }

  const uniqueErrors = [...new Set(filteredErrors)];

  if (uniqueErrors.length === 1 && filteredErrors.length > 1) {
    return `${uniqueErrors[0]} (${filteredErrors.length} batches)`;
  }

  return uniqueErrors.join('; ');
}

// ============ Execution Functions ============

/**
 * Execute batches in parallel with concurrency limit
 */
export async function executeBatches<TBatch, TResult>(
  batches: TBatch[],
  executor: (
    batch: TBatch,
    batchIndex: number,
    totalBatches: number
  ) => Promise<BatchResult<TResult>>,
  config: BatchConfig
): Promise<BatchResult<TResult>[]> {
  const limit = createLimiter(config.concurrency);

  return Promise.all(
    batches.map((batch, index) =>
      limit(() => executor(batch, index, batches.length))
    )
  );
}

/**
 * Wrap batch execution with spinner feedback
 *
 * @param spinnerConfig - Configuration for spinner label
 * @param quiet - Suppress spinner output
 * @param execute - Async function to execute
 * @param formatSuccess - Optional function to format success message
 * @param formatError - Optional function to format error message
 */
export async function withSpinner<T>(
  spinnerConfig: BatchSpinnerConfig,
  quiet: boolean,
  execute: () => Promise<{ success: boolean; data: T; error?: string }>,
  formatSuccess?: (data: T, duration: number) => string,
  formatError?: (error: string) => string
): Promise<BatchResult<T>> {
  const startTime = Date.now();
  const spinnerLabel = formatBatchLabel(spinnerConfig);

  const spinner: Spinner | null = quiet ? null : new Spinner(spinnerLabel);

  try {
    spinner?.start();

    const result = await execute();
    const duration = Date.now() - startTime;

    if (result.success) {
      const successMsg = formatSuccess
        ? formatSuccess(result.data, duration)
        : `${spinnerConfig.label} (${duration}ms)`;
      spinner?.succeed(successMsg);
    } else {
      const errorMsg = formatError
        ? formatError(result.error || 'Unknown error')
        : `${spinnerConfig.label}: ${result.error}`;
      spinner?.fail(errorMsg);
    }

    return {
      success: result.success,
      data: result.data,
      error: result.error,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    const errorMsg = formatError
      ? formatError(errorMessage)
      : `${spinnerConfig.label}: ${errorMessage}`;
    spinner?.fail(errorMsg);

    return {
      success: false,
      data: undefined as T,
      error: errorMessage,
      duration,
    };
  } finally {
    spinner?.stop();
  }
}

/**
 * Check if all batch results succeeded
 */
export function allSucceeded<T>(results: BatchResult<T>[]): boolean {
  return results.every((r) => r.success);
}

/**
 * Get failed results from batch results
 */
export function getFailures<T>(results: BatchResult<T>[]): BatchResult<T>[] {
  return results.filter((r) => !r.success);
}

/**
 * Calculate total duration from batch results
 */
export function totalDuration<T>(results: BatchResult<T>[]): number {
  return results.reduce((sum, r) => sum + (r.duration || 0), 0);
}

/**
 * Collect all data from successful batch results
 */
export function collectData<T>(results: BatchResult<T[]>[]): T[] {
  return results.filter((r) => r.success).flatMap((r) => r.data);
}
