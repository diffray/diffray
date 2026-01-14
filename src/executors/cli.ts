/**
 * CLI Executor - executes agents via command line tools
 */

import { z } from 'zod';
import { spawn } from 'node:child_process';
import type { ExecutionContext, ExecutionResult } from '../types';
import type { Executor, CLIConfig } from './types';
import { log } from '../logger';
import { loadOutputFormat, buildPrompt, buildUserPrompt, createResult } from './utils';
import { trackProcess, ensureSigintHandler } from './process';
import { streamClaudeCli } from './claude-cli';
import { streamCursorAgentCli } from './cursor-agent-cli';
import { streamOpenCodeCli } from './opencode-cli';

// Settings schema for CLI executors
export const CLISettingsSchema = z.object({
  model: z.string().optional(),
  timeout: z.number().positive().optional(),
});

const CLAUDE_CLI_DEFAULTS = {
  model: 'opus',
  timeout: 120,
} as const;

const CURSOR_AGENT_DEFAULTS = {
  model: 'opus-4.5',
  timeout: 120,
} as const;

const OPENCODE_DEFAULTS = {
  model: 'opencode/gpt-5-nano',
  timeout: 120,
} as const;

const CODEX_DEFAULTS = {
  timeout: 120,
} as const;

/**
 * Get effective timeout from context executor or config
 */
function getEffectiveTimeout(ctx: ExecutionContext, configTimeout: number | undefined): number {
  // Prefer timeout from ctx.executor (applied via applySettings) over config default
  if (ctx.executor.type === 'cli' && ctx.executor.timeout !== undefined) {
    return ctx.executor.timeout;
  }
  return configTimeout || 60;
}

/**
 * Get effective model from context executor or config
 */
function getEffectiveModel(
  ctx: ExecutionContext,
  configModel: string | undefined
): string | undefined {
  // Prefer model from ctx.executor (applied via applySettings) over config default
  if (ctx.executor.type === 'cli' && ctx.executor.model !== undefined) {
    return ctx.executor.model;
  }
  return configModel;
}

/**
 * Execute Claude CLI with streaming
 */
async function executeClaudeCli(
  config: CLIConfig,
  ctx: ExecutionContext,
  format: string
): Promise<ExecutionResult> {
  const start = Date.now();
  // Put output format in system prompt so it's not lost after tool use
  const systemPrompt = `${ctx.systemPrompt}\n\n${format}`;
  const userPrompt = ctx.input;

  const effectiveModel = getEffectiveModel(ctx, config.model);
  const effectiveTimeout = getEffectiveTimeout(ctx, config.timeout);

  let finalArgs = config.args || [];
  if (effectiveModel) {
    finalArgs = [...finalArgs, '--model', effectiveModel];
  }

  // Use streaming JSON format
  const streamArgs = finalArgs.map((arg) => (arg === '--output-format' ? '--output-format' : arg));
  const jsonIndex = streamArgs.indexOf('json');
  if (jsonIndex !== -1) {
    streamArgs[jsonIndex] = 'stream-json';
  }
  streamArgs.push('--verbose');

  let cmdArgs: string[];
  if (config.systemPromptArg) {
    cmdArgs = [config.command, ...streamArgs, config.systemPromptArg, systemPrompt, userPrompt];
  } else {
    const fullPrompt = buildPrompt(systemPrompt, ctx.input, format);
    cmdArgs = config.useStdin
      ? [config.command, ...streamArgs]
      : [config.command, ...streamArgs, fullPrompt];
  }

  const output = await streamClaudeCli(cmdArgs, config.env || {}, effectiveTimeout, {
    stream: ctx.stream ?? false,
    verbose: ctx.verbose ?? false,
    agentName: ctx.agent.name,
    cwd: ctx.cwd,
  });

  return createResult(ctx, true, output, undefined, Date.now() - start, userPrompt);
}

/**
 * Execute Cursor Agent CLI with streaming
 * Note: Cursor Agent CLI doesn't have --system-prompt, so we prepend it to user prompt
 */
async function executeCursorAgentCli(
  config: CLIConfig,
  ctx: ExecutionContext,
  format: string
): Promise<ExecutionResult> {
  const start = Date.now();
  // Cursor Agent doesn't have --system-prompt, so combine system + format + user prompt
  const systemPrompt = `${ctx.systemPrompt}\n\n${format}`;
  const fullPrompt = `<system>\n${systemPrompt}\n</system>\n\n${ctx.input}`;

  const effectiveModel = getEffectiveModel(ctx, config.model);
  const effectiveTimeout = getEffectiveTimeout(ctx, config.timeout);

  const cmdArgs: string[] = [config.command];

  // Add print mode for non-interactive use
  cmdArgs.push('-p', '--output-format', 'stream-json');

  // Add model if specified
  if (effectiveModel) {
    cmdArgs.push('--model', effectiveModel);
  }

  // Add combined prompt as positional argument
  cmdArgs.push(fullPrompt);

  const output = await streamCursorAgentCli(cmdArgs, config.env || {}, effectiveTimeout, {
    stream: ctx.stream ?? false,
    verbose: ctx.verbose ?? false,
    agentName: ctx.agent.name,
    cwd: ctx.cwd,
  });

  return createResult(ctx, true, output, undefined, Date.now() - start, ctx.input);
}

/**
 * Execute OpenCode CLI with streaming
 * Note: OpenCode CLI uses 'run' command and different argument structure
 */
async function executeOpenCodeCli(
  config: CLIConfig,
  ctx: ExecutionContext,
  format: string
): Promise<ExecutionResult> {
  const start = Date.now();
  // Combine system prompt and format with user prompt for OpenCode
  const fullPrompt = buildPrompt(ctx.systemPrompt, ctx.input, format);

  const effectiveModel = getEffectiveModel(ctx, config.model);
  const effectiveTimeout = getEffectiveTimeout(ctx, config.timeout);

  let cmdArgs = [config.command, 'run', '--format', 'json'];
  if (effectiveModel) {
    cmdArgs = [...cmdArgs, '--model', effectiveModel];
  }
  // Add the prompt as argument
  cmdArgs.push(fullPrompt);

  const output = await streamOpenCodeCli(cmdArgs, config.env || {}, effectiveTimeout, {
    stream: ctx.stream ?? false,
    verbose: ctx.verbose ?? false,
    agentName: ctx.agent.name,
    cwd: ctx.cwd,
  });

  return createResult(ctx, true, output, undefined, Date.now() - start, ctx.input);
}

/**
 * Execute generic CLI command
 */
async function executeGenericCli(
  config: CLIConfig,
  ctx: ExecutionContext,
  format: string
): Promise<ExecutionResult> {
  const start = Date.now();
  const userPrompt = buildUserPrompt(ctx.input, format);
  const systemPrompt = ctx.systemPrompt;

  const effectiveModel = getEffectiveModel(ctx, config.model);
  const effectiveTimeout = getEffectiveTimeout(ctx, config.timeout);

  let finalArgs = config.args || [];
  if (effectiveModel) {
    finalArgs = [...finalArgs, '--model', effectiveModel];
  }

  let cmdArgs: string[];
  if (config.systemPromptArg) {
    cmdArgs = [...finalArgs, config.systemPromptArg, systemPrompt, userPrompt];
  } else {
    const fullPrompt = buildPrompt(systemPrompt, ctx.input, format);
    cmdArgs = config.useStdin ? [...finalArgs] : [...finalArgs, fullPrompt];
  }

  if (ctx.verbose) {
    log.plain(
      `🔧 CLI: ${config.command} ${cmdArgs.slice(0, -1).join(' ')} <prompt ${userPrompt.length} chars>`
    );
  }

  ensureSigintHandler();

  return new Promise((resolve) => {
    const proc = spawn(config.command, cmdArgs, {
      stdio: [config.useStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...config.env },
      cwd: ctx.cwd,
    });
    trackProcess(proc);

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    proc.stdout?.on('data', (data) => stdoutChunks.push(data));
    proc.stderr?.on('data', (data) => stderrChunks.push(data));

    if (config.useStdin && proc.stdin) {
      const promptToSend = config.systemPromptArg
        ? userPrompt
        : buildPrompt(ctx.systemPrompt, ctx.input, format);
      proc.stdin.write(promptToSend);
      proc.stdin.end();
    }

    const timeout = effectiveTimeout * 1000;
    const timer = setTimeout(() => proc.kill(), timeout);

    proc.on('close', (exitCode) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
      const stderr = Buffer.concat(stderrChunks).toString('utf-8');

      if (ctx.verbose) {
        log.plain(`📥 CLI raw response (${stdout.length} chars):`);
        log.plain(`   ${stdout.slice(0, 500)}${stdout.length > 500 ? '...' : ''}`);
        if (stderr) {
          log.plain(`   stderr: ${stderr.slice(0, 200)}`);
        }
      }

      if (exitCode === null) {
        resolve(
          createResult(
            ctx,
            false,
            '',
            `Process killed (timeout after ${effectiveTimeout}s or signal)${stderr ? `: ${stderr}` : ''}`,
            Date.now() - start,
            userPrompt
          )
        );
        return;
      }

      if (exitCode !== 0) {
        resolve(
          createResult(
            ctx,
            false,
            '',
            `Exit code ${exitCode}: ${stderr}`,
            Date.now() - start,
            userPrompt
          )
        );
        return;
      }

      resolve(createResult(ctx, true, stdout, undefined, Date.now() - start, userPrompt));
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve(
        createResult(
          ctx,
          false,
          '',
          `Process error: ${err.message}`,
          Date.now() - start,
          userPrompt
        )
      );
    });
  });
}

export function createCLIExecutor(config: CLIConfig): Executor {
  return {
    name: config.name,
    description: config.description,
    type: 'cli',
    enabled: true,
    async execute(ctx: ExecutionContext): Promise<ExecutionResult> {
      const start = Date.now();
      try {
        const format = await loadOutputFormat();

        if (config.name === 'claude-cli') {
          return await executeClaudeCli(config, ctx, format);
        }

        if (config.name === 'cursor-agent-cli') {
          return await executeCursorAgentCli(config, ctx, format);
        }

        if (config.name === 'opencode-cli') {
          return await executeOpenCodeCli(config, ctx, format);
        }

        return await executeGenericCli(config, ctx, format);
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
      name: config.name,
      description: config.description,
      type: 'cli' as const,
      command: config.command,
      args: config.args,
      env: config.env,
      timeout: config.timeout,
      model: config.model,
      installCommand: config.installCommand,
      enabled: true,
    }),

    settingsSchema: CLISettingsSchema,

    applySettings: (settings: Record<string, unknown>) => {
      const parsed = CLISettingsSchema.safeParse(settings);
      const validSettings = parsed.success ? parsed.data : {};

      return {
        name: config.name,
        description: config.description,
        type: 'cli' as const,
        command: config.command,
        args: config.args,
        env: config.env,
        timeout: validSettings.timeout ?? config.timeout,
        model: validSettings.model ?? config.model,
        installCommand: config.installCommand,
        enabled: true,
      };
    },
  };
}

// ============ Pre-configured Executors ============

export const claudeCliExecutor = createCLIExecutor({
  name: 'claude-cli',
  description: 'Execute via Claude Code CLI',
  command: 'claude',
  args: ['-p', '--output-format', 'json', '--no-session-persistence'],
  timeout: CLAUDE_CLI_DEFAULTS.timeout,
  model: CLAUDE_CLI_DEFAULTS.model,
  useStdin: false,
  systemPromptArg: '--system-prompt',
  installCommand: 'npm install -g @anthropic-ai/claude-code',
});

export const testCliExecutor = createCLIExecutor({
  name: 'test-cli',
  description: 'Test stub executor - returns empty array (for testing only)',
  command: 'bash',
  args: ['-c', "cat > /dev/null; sleep 1; echo '[]'"],
  timeout: 10,
  useStdin: true,
});

export const cursorAgentCliExecutor = createCLIExecutor({
  name: 'cursor-agent-cli',
  description: 'Execute via Cursor Agent CLI',
  command: 'cursor-agent',
  args: [],
  timeout: CURSOR_AGENT_DEFAULTS.timeout,
  model: CURSOR_AGENT_DEFAULTS.model,
  useStdin: false,
  installCommand: 'curl https://cursor.com/install -fsS | bash',
});

export const opencodeCliExecutor = createCLIExecutor({
  name: 'opencode-cli',
  description: 'Execute via OpenCode CLI',
  command: 'opencode',
  args: ['run', '--format', 'json'],
  timeout: OPENCODE_DEFAULTS.timeout,
  model: OPENCODE_DEFAULTS.model,
  useStdin: false,
  systemPromptArg: undefined, // OpenCode uses different approach
  installCommand: 'curl https://opencode.ai/install -fsS | bash',
});

export const codexCliExecutor = createCLIExecutor({
  name: 'codex-cli',
  description: 'Execute via Codex CLI',
  command: 'codex',
  args: ['exec'],
  timeout: CODEX_DEFAULTS.timeout,
  useStdin: false,
  installCommand: 'npm install -g @openai/codex',
});
