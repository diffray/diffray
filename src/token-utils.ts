/**
 * Token utilities for batching
 */

import type { GitDiff } from './types';
import { estimateTokens } from './token-counter';

/**
 * Calculate tokens for a single diff
 */
function calculateDiffTokens(diff: GitDiff): number {
  const diffText = `File: ${diff.file}\n${diff.diff}`;
  return estimateTokens(diffText);
}

/**
 * Batch configuration
 */
export interface BatchConfig {
  maxTokensPerBatch: number;
}

const DEFAULT_MAX_TOKENS = 10000;

/**
 * Get batch config from environment or defaults
 */
export function getBatchConfig(): BatchConfig {
  const envLimit = process.env.DIFFRAY_BATCH_TOKENS;
  const maxTokensPerBatch = envLimit ? parseInt(envLimit, 10) : DEFAULT_MAX_TOKENS;

  return {
    maxTokensPerBatch: isNaN(maxTokensPerBatch) ? DEFAULT_MAX_TOKENS : maxTokensPerBatch,
  };
}

/**
 * Batch of diffs
 */
export interface DiffBatch {
  diffs: GitDiff[];
  tokenCount: number;
  batchIndex: number;
}

/**
 * Split diffs into batches based on token limit
 * Each batch will not exceed maxTokensPerBatch
 */
export function batchDiffs(
  diffs: GitDiff[],
  systemPrompt: string,
  config?: BatchConfig
): DiffBatch[] {
  const batchConfig = config || getBatchConfig();
  const batches: DiffBatch[] = [];

  // Calculate system prompt tokens (constant overhead for each batch)
  const systemPromptTokens = estimateTokens(systemPrompt);

  // Reserve tokens for system prompt and formatting
  const availableTokensPerBatch = batchConfig.maxTokensPerBatch - systemPromptTokens - 1000; // 1000 for safety margin

  let currentBatch: GitDiff[] = [];
  let currentTokenCount = 0;

  for (const diff of diffs) {
    const diffTokens = calculateDiffTokens(diff);

    // If single diff exceeds limit, put it in its own batch
    if (diffTokens > availableTokensPerBatch) {
      // Save current batch if not empty
      if (currentBatch.length > 0) {
        batches.push({
          diffs: currentBatch,
          tokenCount: currentTokenCount + systemPromptTokens,
          batchIndex: batches.length,
        });
        currentBatch = [];
        currentTokenCount = 0;
      }

      // Add large diff as separate batch
      batches.push({
        diffs: [diff],
        tokenCount: diffTokens + systemPromptTokens,
        batchIndex: batches.length,
      });
      continue;
    }

    // Check if adding this diff would exceed limit
    if (currentTokenCount + diffTokens > availableTokensPerBatch && currentBatch.length > 0) {
      // Save current batch
      batches.push({
        diffs: currentBatch,
        tokenCount: currentTokenCount + systemPromptTokens,
        batchIndex: batches.length,
      });
      currentBatch = [];
      currentTokenCount = 0;
    }

    // Add diff to current batch
    currentBatch.push(diff);
    currentTokenCount += diffTokens;
  }

  // Add remaining batch
  if (currentBatch.length > 0) {
    batches.push({
      diffs: currentBatch,
      tokenCount: currentTokenCount + systemPromptTokens,
      batchIndex: batches.length,
    });
  }

  return batches;
}

/**
 * Format batch info for logging
 */
export function formatBatchInfo(batch: DiffBatch, verbose: boolean = false): string {
  const fileCount = batch.diffs.length;
  const tokenCount = batch.tokenCount.toLocaleString();

  if (verbose) {
    // Show detailed file list in verbose mode
    const fileList = batch.diffs.map((d) => d.file).join(', ');
    return `Batch ${batch.batchIndex + 1}: ${fileCount} file(s), ~${tokenCount} tokens\n    Files: ${fileList}`;
  }

  return `Batch ${batch.batchIndex + 1}: ${fileCount} file(s), ~${tokenCount} tokens`;
}
