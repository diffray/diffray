/**
 * Stage 4: Deduplication
 */

import type { Stage, StageResult, PipelineContext, Issue } from '../types';
import { log } from '../logger';

// Similarity threshold for semantic deduplication (0-1)
const SIMILARITY_THRESHOLD = 0.6;

/**
 * Normalize text for comparison: lowercase, remove punctuation, split into words
 */
function normalizeText(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2); // ignore short words
  return new Set(words);
}

/**
 * Calculate Jaccard similarity between two sets of words (0-1)
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }

  const union = a.size + b.size - intersection;
  return intersection / union;
}

/**
 * Check if two issues are semantically similar
 */
function areSimilarIssues(a: Issue, b: Issue): boolean {
  // Must be in the same file
  if (a.file !== b.file) return false;

  // Check if lines overlap or are close (within 10 lines)
  const lineDistance = Math.min(
    Math.abs(a.lineStart - b.lineStart),
    Math.abs(a.lineEnd - b.lineEnd)
  );
  if (lineDistance > 10) return false;

  // Compare short descriptions
  const wordsA = normalizeText(a.shortDescription);
  const wordsB = normalizeText(b.shortDescription);
  const similarity = jaccardSimilarity(wordsA, wordsB);

  return similarity >= SIMILARITY_THRESHOLD;
}

export function createDeduplicationStage(): Stage {
  return {
    id: 'deduplication',
    name: 'Deduplication',
    description: 'Remove duplicate results and issues',
    enabled: true,
    order: 4,
    execute: async (context: PipelineContext): Promise<StageResult> => {
      const startTime = Date.now();

      // Step 1: Merge all issues from all results
      const allIssues = context.results.flatMap((result) => result.issues);
      const totalBefore = allIssues.length;

      // Step 2: Deduplicate by exact location (same file+lines = same issue)
      const seenLocations = new Set<string>();
      const locationDeduped = allIssues.filter((issue) => {
        const key = `${issue.file}:${issue.lineStart}:${issue.lineEnd}`;
        if (seenLocations.has(key)) {
          return false;
        }
        seenLocations.add(key);
        return true;
      });

      // Step 3: Semantic deduplication (similar descriptions in nearby lines)
      const semanticDeduped: Issue[] = [];
      for (const issue of locationDeduped) {
        const isDuplicate = semanticDeduped.some((existing) =>
          areSimilarIssues(existing, issue)
        );
        if (!isDuplicate) {
          semanticDeduped.push(issue);
        }
      }

      context.issues = semanticDeduped;

      const removedByLocation = totalBefore - locationDeduped.length;
      const removedBySemantic = locationDeduped.length - semanticDeduped.length;
      const totalRemoved = removedByLocation + removedBySemantic;

      if (totalRemoved > 0 && !context.quiet) {
        const parts = [];
        if (removedByLocation > 0) parts.push(`${removedByLocation} by location`);
        if (removedBySemantic > 0) parts.push(`${removedBySemantic} by similarity`);
        log.sync(`Removed ${totalRemoved} duplicate issue(s) (${parts.join(', ')})`);
      }

      return {
        stageId: 'deduplication',
        stageName: 'Deduplication',
        success: true,
        duration: Date.now() - startTime,
      };
    },
  };
}
