/**
 * Claude CLI Executor - streaming JSON parsing for Claude Code CLI
 */

import { spawn } from 'node:child_process';
import type { StreamOptions } from './types';
import { log } from '../logger';
import { parseIssues } from '../issue-parser';
import { formatIssue } from '../issue-formatter';
import { trackProcess, ensureSigintHandler, gracefulKillSync } from './process';

/**
 * Format preliminary issues found in streaming result
 */
function formatPreliminaryIssues(result: string, agentName: string): void {
  const issues = parseIssues(result, agentName);
  if (issues.length === 0) return;

  log.plain(`\n\x1b[33m⚠ Preliminary issues (may be filtered):\x1b[0m`);
  for (const issue of issues) {
    log.plain(formatIssue(issue, true));
  }
  log.plain('');
}

/**
 * Parse a single streaming message and handle output
 */
interface StreamMessage {
  type?: string;
  subtype?: string;
  tools?: unknown[];
  model?: string;
  message?: { content?: Array<{ type: string; name?: string; text?: string }> };
  total_cost_usd?: number;
  duration_ms?: number;
  result?: string;
  error?: string;
}

function handleStreamMessage(
  message: StreamMessage,
  line: string,
  opts: StreamOptions
): string | null {
  // Verbose mode: raw JSON output
  if (opts.verbose) {
    log.plain(`\x1b[90m${line}\x1b[0m`);
  }

  // Stream mode: thinking + tools
  if (opts.stream && !opts.verbose) {
    if (message.type === 'system') {
      const tools = message.tools?.length || 0;
      const model = message.model || 'unknown';
      log.plain(`\x1b[90m📋 ${model}, ${tools} tools\x1b[0m`);
    } else if (message.type === 'assistant' && message.message?.content) {
      for (const content of message.message.content) {
        if (content.type === 'tool_use') {
          log.plain(`\x1b[36m🔧 ${content.name}\x1b[0m`);
        } else if (content.type === 'text' && content.text) {
          const text = content.text.slice(0, 200);
          const truncated = content.text.length > 200 ? '...' : '';
          log.plain(`\x1b[90m💭 ${text}${truncated}\x1b[0m`);
        }
      }
    }
  }

  // Handle result message
  if (message.type === 'result') {
    if (opts.stream && !opts.verbose) {
      const cost = message.total_cost_usd ? `$${message.total_cost_usd.toFixed(4)}` : '';
      const duration = message.duration_ms ? `${(message.duration_ms / 1000).toFixed(1)}s` : '';
      log.plain(`\x1b[90m📊 ${duration} ${cost}\x1b[0m`);
    }

    if (message.subtype === 'success' && message.result) {
      return message.result;
    } else if (message.subtype === 'error') {
      throw new Error(message.error || 'Claude CLI returned error');
    }
  }

  return null;
}

/**
 * Stream and parse Claude CLI JSON output
 */
export async function streamClaudeCli(
  cmdArgs: string[],
  env: Record<string, string>,
  timeout: number,
  opts: StreamOptions
): Promise<string> {
  if (cmdArgs.length === 0) {
    throw new Error('No command provided to streamClaudeCli');
  }

  ensureSigintHandler();

  const [command, ...args] = cmdArgs;
  const proc = spawn(command!, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
    cwd: opts.cwd,
  });
  trackProcess(proc);

  const timeoutMs = timeout * 1000;
  const timer = setTimeout(() => gracefulKillSync(proc, 2000), timeoutMs);

  return new Promise((resolve, reject) => {
    let finalResult = '';
    let buffer = '';
    const stderrChunks: Buffer[] = [];

    proc.stderr?.on('data', (data) => stderrChunks.push(data));

    proc.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString('utf-8');
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const message = JSON.parse(line);
          const result = handleStreamMessage(message, line, opts);

          if (result !== null) {
            finalResult = result;
            if (opts.stream && opts.agentName) {
              formatPreliminaryIssues(finalResult, opts.agentName);
            }
          }
        } catch {
          if (process.env.DEBUG) {
            log.plain(`📡 Stream parse error: ${line}`);
          }
        }
      }
    });

    proc.on('close', (exitCode) => {
      clearTimeout(timer);

      // Handle remaining buffer
      if (buffer.trim()) {
        try {
          const message = JSON.parse(buffer);
          if (message.type === 'result' && message.subtype === 'success' && message.result) {
            finalResult = message.result;
          }
        } catch {
          // Ignore final buffer parse errors
        }
      }

      const stderrText = Buffer.concat(stderrChunks).toString('utf-8');

      if (exitCode === null) {
        reject(
          new Error(
            `Process killed (timeout after ${timeout}s or signal)${stderrText ? `: ${stderrText}` : ''}`
          )
        );
        return;
      }

      if (exitCode !== 0) {
        reject(new Error(`Exit code ${exitCode}: ${stderrText}`));
        return;
      }

      resolve(finalResult);
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
