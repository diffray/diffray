/**
 * Cursor Agent CLI Executor - streaming JSON parsing for Cursor Agent CLI
 *
 * Cursor Agent CLI is installed via: curl https://cursor.com/install -fsS | bash
 * Binary location: ~/.local/bin/agent or ~/.local/bin/cursor-agent
 */

import type { StreamOptions } from './types';
import { streamCliProcess } from './stream-cli';

/**
 * Stream and parse Cursor Agent CLI JSON output
 */
export async function streamCursorAgentCli(
  cmdArgs: string[],
  env: Record<string, string>,
  timeout: number,
  opts: StreamOptions
): Promise<string> {
  return streamCliProcess(cmdArgs, env, timeout, opts, 'Cursor Agent CLI');
}
