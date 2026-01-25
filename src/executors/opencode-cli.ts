/**
 * OpenCode Executor - streaming JSON parsing for OpenCode CLI
 */

import type { StreamOptions } from './types';
import { streamCliProcess } from './stream-cli';

/**
 * Stream and parse OpenCode CLI JSON output
 */
export async function streamOpenCodeCli(
  cmdArgs: string[],
  env: Record<string, string>,
  timeout: number,
  opts: StreamOptions
): Promise<string> {
  return streamCliProcess(cmdArgs, env, timeout, opts, 'OpenCode CLI');
}
