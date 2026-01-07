/**
 * Simplified Executor System
 * No classes, just functions and plain objects
 */

import type { AgentExecutor, ExecutionContext, ExecutionResult } from '../types';
import { log } from '../logger';
import { join } from 'path';
import { fileURLToPath } from 'url';

// ============ Output Format (cached) ============

let outputFormatCache: string | null = null;

async function loadOutputFormat(): Promise<string> {
  if (outputFormatCache) return outputFormatCache;
  try {
    const __filename = fileURLToPath(import.meta.url);
    const formatPath = join(__filename, '..', '..', 'defaults', 'output-format.md');
    outputFormatCache = await Bun.file(formatPath).text();
    return outputFormatCache;
  } catch {
    return '\n\n# Output Format\n\nReturn results as JSON array: []';
  }
}

function buildPrompt(systemPrompt: string, input: string, format: string): string {
  return `${systemPrompt}\n\n# Input:\n${input}\n\n${format}`;
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
  makeRequest: (prompt: string, cfg: APIConfig) => Promise<string>
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
        const prompt = buildPrompt(ctx.systemPrompt, ctx.input, format);
        const output = await makeRequest(prompt, config);
        return createResult(ctx, true, output, undefined, Date.now() - start, prompt);
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
        const prompt = buildPrompt(ctx.systemPrompt, ctx.input, format);

        const cmdArgs = config.useStdin
          ? [config.command, ...(config.args || [])]
          : [config.command, ...(config.args || []), prompt];

        if (ctx.verbose) {
          log.plain(`🔧 CLI: ${cmdArgs.slice(0, -1).join(' ')} <prompt ${prompt.length} chars>`);
        }

        const proc = Bun.spawn(cmdArgs, {
          stdin: config.useStdin ? 'pipe' : 'ignore',
          stdout: 'pipe',
          stderr: 'pipe',
          env: { ...process.env, ...config.env },
        });

        if (config.useStdin && proc.stdin) {
          proc.stdin.write(prompt);
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

        if (proc.exitCode !== 0) {
          return createResult(
            ctx,
            false,
            '',
            `Exit code ${proc.exitCode}: ${stderr}`,
            Date.now() - start,
            prompt
          );
        }
        return createResult(ctx, true, stdout, undefined, Date.now() - start, prompt);
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
      enabled: true,
    }),
  };
}

// ============ Executor Definitions ============

// Cerebras API
async function cerebrasRequest(prompt: string, cfg: APIConfig): Promise<string> {
  if (!cfg.apiKey) throw new Error('CEREBRAS_API_KEY not set');

  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: 'user', content: prompt }],
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

const cerebrasExecutor = createAPIExecutor(
  {
    name: 'cerebras-api',
    description: 'Execute via Cerebras AI API (llama-3.3-70b)',
    model: 'llama-3.3-70b',
    apiKey: process.env.CEREBRAS_API_KEY,
    baseUrl: 'https://api.cerebras.ai/v1',
    temperature: 0.7,
    maxTokens: 8192,
  },
  cerebrasRequest
);

const claudeCliExecutor = createCLIExecutor({
  name: 'claude-cli',
  description: 'Execute via Claude Code CLI',
  command: 'claude',
  args: ['-p', '--output-format', 'json', '--no-session-persistence'],
  timeout: 120,
  useStdin: false,
});

const defaultCliExecutor = createCLIExecutor({
  name: 'default-cli',
  description: 'Default stub executor - returns empty array',
  command: 'bash',
  args: ['-c', "cat > /dev/null; sleep 1; echo '[]'"],
  timeout: 10,
  useStdin: true,
});

// ============ Registry ============

const executors = new Map<string, Executor>([
  ['cerebras-api', cerebrasExecutor],
  ['claude-cli', claudeCliExecutor],
  ['default-cli', defaultCliExecutor],
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

  // Fallback to default-cli if not found or disabled
  if (!executor || !executor.enabled) {
    if (process.env.DEBUG) {
      console.warn(`Executor "${ctx.executor.name}" not available, using default-cli`);
    }
    executor = executors.get('default-cli');
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
