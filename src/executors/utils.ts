/**
 * Shared utilities for executors
 */

import type { ExecutionContext, ExecutionResult } from '../types';
import { getCached, CACHE_KEYS } from '../cache';
import { log } from '../logger';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ============ Retry Helper ============

const DEFAULT_RETRIES = 3;
const RETRY_BASE_DELAY = 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with exponential backoff retry for transient errors
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = DEFAULT_RETRIES
): Promise<Response> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, options);

      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
        return res;
      }

      lastError = new Error(`HTTP ${res.status}`);

      if (attempt < retries - 1) {
        const delay = RETRY_BASE_DELAY * Math.pow(2, attempt);
        if (process.env.DEBUG) {
          log.plain(`⏳ Retry ${attempt + 1}/${retries - 1} after ${delay}ms (${res.status})`);
        }
        await sleep(delay);
      }
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));

      if (attempt < retries - 1) {
        const delay = RETRY_BASE_DELAY * Math.pow(2, attempt);
        if (process.env.DEBUG) {
          log.plain(
            `⏳ Retry ${attempt + 1}/${retries - 1} after ${delay}ms (${lastError.message})`
          );
        }
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

// ============ Prompt Helpers ============

const DEFAULT_OUTPUT_FORMAT = `# Output Format

Return your findings as a **JSON array** wrapped in \`<json>...</json>\` XML tags:

<json>
[
  {
    "file": "path/to/file.ts",
    "lineStart": 10,
    "lineEnd": 15,
    "severity": "critical|high|medium|low",
    "category": "security|performance|bug|quality|style|docs",
    "shortDescription": "Brief one-line description",
    "fullDescription": "Detailed description of the issue",
    "suggestion": "How to fix this issue (optional)"
  }
]
</json>

Return empty array if no issues found: \`<json>[]</json>\`
`;

export async function loadOutputFormat(): Promise<string> {
  return getCached(CACHE_KEYS.OUTPUT_FORMAT, async () => {
    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const formatPath = join(__dirname, '..', 'defaults', 'prompts', 'output-format.md');
      return await readFile(formatPath, 'utf-8');
    } catch {
      return DEFAULT_OUTPUT_FORMAT;
    }
  });
}

export function buildPrompt(systemPrompt: string, input: string, format: string): string {
  return `${systemPrompt}\n\n# Input:\n${input}\n\n${format}`;
}

export function buildUserPrompt(input: string, format: string): string {
  return `${input}\n\n${format}`;
}

// ============ Result Helper ============

export function createResult(
  ctx: ExecutionContext,
  success: boolean,
  output: string,
  error: string | undefined,
  duration: number,
  prompt?: string
): ExecutionResult {
  return {
    agent: ctx.agent.name,
    executor: ctx.executor.name,
    success,
    output,
    error,
    duration,
    prompt,
  };
}
