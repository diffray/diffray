/**
 * Simplified Executor System
 * No classes, just functions and plain objects
 */

import type { AgentExecutor, ExecutionContext, ExecutionResult, Issue } from './types';
import type { Subprocess } from 'bun';
import { log } from './logger';
import { loadConfig } from './config';
import { parseIssues } from './issue-parser';
import { formatIssue } from './issue-formatter';
import { getCached, CACHE_KEYS } from './cache';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ============ Process Management ============

// Track all active spawned processes for cleanup on SIGINT
const activeProcesses = new Set<Subprocess>();

function trackProcess(proc: Subprocess): void {
  activeProcesses.add(proc);
  proc.exited.then(() => activeProcesses.delete(proc)).catch(() => activeProcesses.delete(proc));
}

function killAllProcesses(): void {
  for (const proc of activeProcesses) {
    try {
      proc.kill();
    } catch {
      // Process may already be dead
    }
  }
  activeProcesses.clear();
}

// Register SIGINT handler once
let sigintHandlerRegistered = false;
function ensureSigintHandler(): void {
  if (sigintHandlerRegistered) return;
  sigintHandlerRegistered = true;

  process.on('SIGINT', () => {
    killAllProcesses();
    process.exit(130); // Standard exit code for SIGINT
  });
}

// ============ Retry Helper ============

const DEFAULT_RETRIES = 3;
const RETRY_BASE_DELAY = 1000; // 1 second

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with exponential backoff retry for transient errors
 * Retries on: 429 (rate limit), 5xx (server errors), network errors
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = DEFAULT_RETRIES
): Promise<Response> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, options);

      // Success or client error (4xx except 429) - don't retry
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
        return res;
      }

      // Rate limit or server error - retry with backoff
      lastError = new Error(`HTTP ${res.status}`);

      if (attempt < retries - 1) {
        const delay = RETRY_BASE_DELAY * Math.pow(2, attempt);
        if (process.env.DEBUG) {
          log.plain(`⏳ Retry ${attempt + 1}/${retries - 1} after ${delay}ms (${res.status})`);
        }
        await sleep(delay);
      }
    } catch (e) {
      // Network error - retry
      lastError = e instanceof Error ? e : new Error(String(e));

      if (attempt < retries - 1) {
        const delay = RETRY_BASE_DELAY * Math.pow(2, attempt);
        if (process.env.DEBUG) {
          log.plain(`⏳ Retry ${attempt + 1}/${retries - 1} after ${delay}ms (${lastError.message})`);
        }
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

// ============ Prompt Loaders (using unified cache) ============

async function loadOutputFormat(): Promise<string> {
  return getCached(CACHE_KEYS.OUTPUT_FORMAT, async () => {
    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const formatPath = join(__dirname, 'defaults', 'prompts', 'output-format.md');
      return await Bun.file(formatPath).text();
    } catch {
      return '\n\n# Output Format\n\nReturn results as JSON array: []';
    }
  });
}


function buildPrompt(systemPrompt: string, input: string, format: string): string {
  return `${systemPrompt}\n\n# Input:\n${input}\n\n${format}`;
}

function buildUserPrompt(input: string, format: string): string {
  return `${input}\n\n${format}`;
}

function createResult(
  ctx: ExecutionContext,
  success: boolean,
  output: string,
  error: string | undefined,
  duration: number,
  prompt?: string
): ExecutionResult {
  return {
    agentId: ctx.agent.id,
    agentName: ctx.agent.name,
    executor: ctx.executor.name,
    executorName: ctx.executor.name,
    success,
    output,
    error,
    duration,
    prompt,
  };
}

// ============ Executor Type ============

export interface Executor {
  name: string;
  description: string;
  type: 'llm-api' | 'cli';
  enabled: boolean;
  execute: (ctx: ExecutionContext) => Promise<ExecutionResult>;
  getInfo: () => AgentExecutor;
}

// ============ API Executor Helper ============

interface APIConfig {
  name: string;
  description: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

function createAPIExecutor(
  config: APIConfig,
  makeRequest: (systemPrompt: string, userPrompt: string, cfg: APIConfig) => Promise<string>
): Executor {
  return {
    name: config.name,
    description: config.description,
    type: 'llm-api',
    enabled: Boolean(config.apiKey),
    async execute(ctx: ExecutionContext): Promise<ExecutionResult> {
      const start = Date.now();
      try {
        const format = await loadOutputFormat();
        const userPrompt = buildUserPrompt(ctx.input, format);

        if (ctx.verbose) {
          log.plain(`🔧 API: ${config.name} (model: ${config.model})`);
        }

        const output = await makeRequest(ctx.systemPrompt, userPrompt, config);

        if (ctx.verbose) {
          log.plain(`📥 API raw response (${output.length} chars):`);
          log.plain(`   ${output.slice(0, 500)}${output.length > 500 ? '...' : ''}`);
        }

        return createResult(ctx, true, output, undefined, Date.now() - start, userPrompt);
      } catch (e) {
        return createResult(
          ctx,
          false,
          '',
          e instanceof Error ? e.message : String(e),
          Date.now() - start
        );
      }
    },
    getInfo: () => ({
      id: config.name,
      name: config.name,
      description: config.description,
      type: 'llm-api' as const,
      provider: 'custom' as const,
      model: config.model,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      enabled: Boolean(config.apiKey),
    }),
  };
}

// ============ CLI Executor Helper ============

interface CLIConfig {
  name: string;
  description: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  timeout?: number;
  useStdin?: boolean;
  model?: string;
  systemPromptArg?: string;
}

interface StreamOptions {
  stream: boolean; // Show thinking + preliminary issues
  verbose: boolean; // Show raw JSON
  agentName?: string; // Agent name for issue formatting
}

/**
 * Format preliminary issues found in streaming result
 */
function formatPreliminaryIssues(result: string, agentName: string): void {
  const issues = parseIssues(result, agentName);
  if (issues.length === 0) return;

  log.plain(`\n\x1b[33m⚠ Preliminary issues (may be filtered):\x1b[0m`);
  for (const issue of issues) {
    log.plain(formatIssue(issue, true)); // compact format
  }
  log.plain('');
}

async function streamClaudeCli(
  cmdArgs: string[],
  env: Record<string, string>,
  timeout: number,
  opts: StreamOptions
): Promise<string> {
  ensureSigintHandler();

  const proc = Bun.spawn(cmdArgs, {
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, ...env },
  });
  trackProcess(proc);

  const timeoutMs = timeout * 1000;
  const timer = setTimeout(() => proc.kill(), timeoutMs);

  let finalResult = '';
  let stderrText = '';

  try {
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const message = JSON.parse(line);

          // Verbose mode: raw JSON output
          if (opts.verbose) {
            log.plain(`\x1b[90m${line}\x1b[0m`);
          }

          // Stream mode: thinking + tools + preliminary issues
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

          if (message.type === 'result') {
            if (opts.stream && !opts.verbose) {
              const cost = message.total_cost_usd
                ? `$${message.total_cost_usd.toFixed(4)}`
                : '';
              const duration = message.duration_ms
                ? `${(message.duration_ms / 1000).toFixed(1)}s`
                : '';
              log.plain(`\x1b[90m📊 ${duration} ${cost}\x1b[0m`);
            }
            if (message.subtype === 'success' && message.result) {
              finalResult = message.result;
              // Show preliminary issues in stream mode
              if (opts.stream && opts.agentName) {
                formatPreliminaryIssues(finalResult, opts.agentName);
              }
            } else if (message.subtype === 'error') {
              throw new Error(message.error || 'Claude CLI returned error');
            }
          }
        } catch (e) {
          if (process.env.DEBUG) {
            log.plain(`📡 Stream parse error: ${line}`);
          }
        }
      }
    }

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

    const stderr = await new Response(proc.stderr).text();
    stderrText = stderr;
    await proc.exited;
    clearTimeout(timer);

    if (proc.exitCode === null) {
      throw new Error(`Process killed (timeout after ${timeout}s or signal)${stderrText ? `: ${stderrText}` : ''}`);
    }

    if (proc.exitCode !== 0) {
      throw new Error(`Exit code ${proc.exitCode}: ${stderrText}`);
    }

    return finalResult;
  } catch (e) {
    clearTimeout(timer);
    proc.kill();
    throw e;
  }
}

function createCLIExecutor(config: CLIConfig): Executor {
  return {
    name: config.name,
    description: config.description,
    type: 'cli',
    enabled: true,
    async execute(ctx: ExecutionContext): Promise<ExecutionResult> {
      const start = Date.now();
      try {
        const format = await loadOutputFormat();
        const userPrompt = buildUserPrompt(ctx.input, format);
        const systemPrompt = ctx.systemPrompt;

        // Build args, injecting model if specified
        let finalArgs = config.args || [];
        if (config.model) {
          finalArgs = [...finalArgs, '--model', config.model];
        }

        // Always use streaming for claude-cli to show thinking
        if (config.name === 'claude-cli') {
          // Use streaming JSON format - shows thinking unless quiet mode
          // Claude CLI requires --verbose when using stream-json
          const streamArgs = finalArgs.map(arg =>
            arg === '--output-format' ? '--output-format' : arg
          );
          const jsonIndex = streamArgs.indexOf('json');
          if (jsonIndex !== -1) {
            streamArgs[jsonIndex] = 'stream-json';
          }
          // Add --verbose flag required for stream-json
          streamArgs.push('--verbose');

          let cmdArgs: string[];
          if (config.systemPromptArg) {
            cmdArgs = [
              config.command,
              ...streamArgs,
              config.systemPromptArg,
              systemPrompt,
              userPrompt,
            ];
          } else {
            const fullPrompt = buildPrompt(systemPrompt, ctx.input, format);
            cmdArgs = config.useStdin
              ? [config.command, ...streamArgs]
              : [config.command, ...streamArgs, fullPrompt];
          }

          // stream = thinking + issues, verbose = raw JSON
          const output = await streamClaudeCli(cmdArgs, config.env || {}, config.timeout || 60, {
            stream: ctx.stream ?? false,
            verbose: ctx.verbose ?? false,
            agentName: ctx.agent.name,
          });

          return createResult(ctx, true, output, undefined, Date.now() - start, userPrompt);
        }

        // Non-streaming mode (for other CLI executors)
        let cmdArgs: string[];
        if (config.systemPromptArg) {
          cmdArgs = [
            config.command,
            ...finalArgs,
            config.systemPromptArg,
            systemPrompt,
            userPrompt,
          ];
        } else {
          const fullPrompt = buildPrompt(systemPrompt, ctx.input, format);
          cmdArgs = config.useStdin
            ? [config.command, ...finalArgs]
            : [config.command, ...finalArgs, fullPrompt];
        }

        if (ctx.verbose) {
          log.plain(
            `🔧 CLI: ${cmdArgs.slice(0, -1).join(' ')} <prompt ${userPrompt.length} chars>`
          );
        }

        ensureSigintHandler();

        const proc = Bun.spawn(cmdArgs, {
          stdin: config.useStdin ? 'pipe' : 'ignore',
          stdout: 'pipe',
          stderr: 'pipe',
          env: { ...process.env, ...config.env },
        });
        trackProcess(proc);

        if (config.useStdin && proc.stdin) {
          const promptToSend = config.systemPromptArg
            ? userPrompt
            : buildPrompt(ctx.systemPrompt, ctx.input, format);
          proc.stdin.write(promptToSend);
          proc.stdin.end();
        }

        const timeout = (config.timeout || 60) * 1000;
        const timer = setTimeout(() => proc.kill(), timeout);

        const [stdout, stderr] = await Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
        ]);
        await proc.exited;
        clearTimeout(timer);

        if (ctx.verbose) {
          log.plain(`📥 CLI raw response (${stdout.length} chars):`);
          log.plain(`   ${stdout.slice(0, 500)}${stdout.length > 500 ? '...' : ''}`);
          if (stderr) {
            log.plain(`   stderr: ${stderr.slice(0, 200)}`);
          }
        }

        if (proc.exitCode === null) {
          return createResult(
            ctx,
            false,
            '',
            `Process killed (timeout after ${config.timeout || 60}s or signal)${stderr ? `: ${stderr}` : ''}`,
            Date.now() - start,
            userPrompt
          );
        }

        if (proc.exitCode !== 0) {
          return createResult(
            ctx,
            false,
            '',
            `Exit code ${proc.exitCode}: ${stderr}`,
            Date.now() - start,
            userPrompt
          );
        }
        return createResult(ctx, true, stdout, undefined, Date.now() - start, userPrompt);
      } catch (e) {
        return createResult(
          ctx,
          false,
          '',
          e instanceof Error ? e.message : String(e),
          Date.now() - start
        );
      }
    },
    getInfo: () => ({
      id: config.name,
      name: config.name,
      description: config.description,
      type: 'cli' as const,
      command: config.command,
      args: config.args,
      env: config.env,
      timeout: config.timeout,
      model: config.model,
      enabled: true,
    }),
  };
}

// ============ Executor Definitions ============

// Cerebras API
async function cerebrasRequest(
  systemPrompt: string,
  userPrompt: string,
  cfg: APIConfig
): Promise<string> {
  if (!cfg.apiKey) throw new Error('CEREBRAS_API_KEY not set');

  const res = await fetchWithRetry(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: cfg.temperature || 0.7,
      max_tokens: cfg.maxTokens || 8192,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Cerebras API: ${res.status} - ${error}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content || '';
}

// Default Cerebras config - can be overridden via config
const CEREBRAS_DEFAULTS = {
  model: 'llama-3.3-70b',
  temperature: 0.7,
  maxTokens: 8192,
  baseUrl: 'https://api.cerebras.ai/v1',
} as const;

// Default Claude CLI config - can be overridden via config
const CLAUDE_CLI_DEFAULTS = {
  model: 'sonnet',
  timeout: 120,
} as const;

const cerebrasExecutor = createAPIExecutor(
  {
    name: 'cerebras-api',
    description: 'Execute via Cerebras AI API',
    model: CEREBRAS_DEFAULTS.model,
    apiKey: process.env.CEREBRAS_API_KEY,
    baseUrl: CEREBRAS_DEFAULTS.baseUrl,
    temperature: CEREBRAS_DEFAULTS.temperature,
    maxTokens: CEREBRAS_DEFAULTS.maxTokens,
  },
  cerebrasRequest
);

const claudeCliExecutor = createCLIExecutor({
  name: 'claude-cli',
  description: 'Execute via Claude Code CLI',
  command: 'claude',
  args: ['-p', '--output-format', 'json', '--no-session-persistence'],
  timeout: CLAUDE_CLI_DEFAULTS.timeout,
  model: CLAUDE_CLI_DEFAULTS.model,
  useStdin: false,
  systemPromptArg: '--system-prompt',
});

const testCliExecutor = createCLIExecutor({
  name: 'test-cli',
  description: 'Test stub executor - returns empty array (for testing only)',
  command: 'bash',
  args: ['-c', "cat > /dev/null; sleep 1; echo '[]'"],
  timeout: 10,
  useStdin: true,
});

// ============ Registry ============

const executors = new Map<string, Executor>([
  ['cerebras-api', cerebrasExecutor],
  ['claude-cli', claudeCliExecutor],
  ['test-cli', testCliExecutor],
]);

export function getExecutor(name: string): Executor | undefined {
  return executors.get(name);
}

export function listExecutors(): Executor[] {
  return [...executors.values()];
}

export function registerExecutor(config: AgentExecutor): void {
  const existing = executors.get(config.name);
  if (existing) {
    // Update enabled state from user config
    existing.enabled = config.enabled;
  }
}

export async function executeAgent(ctx: ExecutionContext): Promise<ExecutionResult> {
  let executor = executors.get(ctx.executor.name);

  // Fallback to test-cli if not found or disabled
  if (!executor || !executor.enabled) {
    if (process.env.DEBUG) {
      console.warn(`Executor "${ctx.executor.name}" not available, using test-cli`);
    }
    executor = executors.get('test-cli');
  }

  if (!executor) {
    throw new Error(`No executor found: ${ctx.executor.name}`);
  }

  return executor.execute(ctx);
}

// ============ Compatibility Exports ============

// For backwards compatibility with factory.ts pattern
export const executorFactory = {
  async autoDiscover(): Promise<void> {
    // No-op - executors are already defined
  },
  get: getExecutor,
  listExecutors(): AgentExecutor[] {
    return listExecutors().map((e) => e.getInfo());
  },
  registerExecutor,
  executeAgent,
};

// ============ High-Level Loaders ============

/**
 * Loads and registers all available executors.
 * @returns Promise that resolves to an array of registered AgentExecutor instances
 */
export async function loadExecutors(): Promise<AgentExecutor[]> {
  await executorFactory.autoDiscover();
  const allExecutors = executorFactory.listExecutors();
  const config = await loadConfig();

  const savedExecutors = config.executors || [];

  return allExecutors.map((executor) => {
    const savedExecutor = savedExecutors.find((saved) => saved.name === executor.name);
    if (savedExecutor) {
      return {
        ...executor,
        enabled: savedExecutor.enabled ?? executor.enabled,
        // Apply config overrides
        ...(savedExecutor.model && { model: savedExecutor.model }),
        ...(savedExecutor.temperature !== undefined && { temperature: savedExecutor.temperature }),
        ...(savedExecutor.maxTokens !== undefined && { maxTokens: savedExecutor.maxTokens }),
        ...(savedExecutor.timeout !== undefined && { timeout: savedExecutor.timeout }),
      };
    }
    return executor;
  });
}

/**
 * Loads exclude patterns from configuration.
 * @returns Promise that resolves to an array of exclude pattern strings
 */
export async function loadExcludePatterns(): Promise<string[]> {
  const config = await loadConfig();
  return config.excludePatterns;
}