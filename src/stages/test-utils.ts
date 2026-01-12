/**
 * Shared test utilities for stage tests
 */

import type { PipelineContext, Issue, AgentResult } from '../types.js';

/**
 * Create a mock PipelineContext for testing
 * @param issues - Issues to include in the context
 * @param overrides - Optional overrides for context properties
 */
export function createMockContext(
  issues: Issue[],
  overrides?: Partial<PipelineContext>
): PipelineContext {
  return {
    diffs: [],
    results: [
      {
        agent: 'test-agent',
        executor: 'test-executor',
        success: true,
        output: '',
        issues: [...issues], // Copy to preserve original
        duration: 0,
      } as AgentResult,
    ],
    issues: [...issues], // Copy to preserve original
    metadata: {
      timestamp: Date.now(),
      repository: process.cwd(),
    },
    concurrency: 6,
    quiet: true,
    ...overrides,
  };
}

/**
 * Create a test Issue with default values
 * @param overrides - Properties to override defaults
 */
export function createIssue(overrides: Partial<Issue>): Issue {
  return {
    file: 'test.ts',
    lineStart: 1,
    lineEnd: 1,
    severity: 'medium',
    category: 'bug',
    shortDescription: 'Test issue',
    fullDescription: 'Test issue description',
    agent: 'test-agent',
    confidence: 90,
    ...overrides,
  } as Issue;
}
