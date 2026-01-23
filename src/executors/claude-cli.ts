/**
 * Claude CLI Executor - streaming JSON parsing for Claude Code CLI
 */

import type { StreamOptions } from './types';
import { streamCliProcess } from './stream-cli';

/**
 * Stream and parse Claude CLI JSON output
 */
export async function streamClaudeCli(
  cmdArgs: string[],
  env: Record<string, string>,
  timeout: number,
  opts: StreamOptions
): Promise<string> {
  return streamCliProcess(cmdArgs, env, timeout, opts, 'Claude CLI');
}
