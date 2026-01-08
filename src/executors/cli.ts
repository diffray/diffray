/**
 * CLI Executor - executes agents via command line tools
 */

import { z } from 'zod';
import type { ExecutionContext, ExecutionResult } from '../types';
import type { Executor, CLIConfig } from './types';
import { log } from '../logger';
import { loadOutputFormat, buildPrompt, buildUserPrompt, createResult } from './utils';
import { trackProcess, ensureSigintHandler } from './process';
import { streamClaudeCli } from './claude-cli';

// Settings schema for CLI executors
export const CLISettingsSchema = z.object({
  model: z.string().optional(),
  timeout: z.number().positive().optional(),
});

const CLAUDE_CLI_DEFAULTS = {
  model: 'sonnet',
  timeout: 120,
} as const;

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

  let finalArgs = config.args || [];
  if (config.model) {
    finalArgs = [...finalArgs, '--model', config.model];
  }

  // Use streaming JSON format
  const streamArgs = finalArgs.map((arg) =>
    arg === '--output-format' ? '--output-format' : arg
  );
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

  const output = await streamClaudeCli(cmdArgs, config.env || {}, config.timeout || 60, {
    stream: ctx.stream ?? false,
    verbose: ctx.verbose ?? false,
    agentName: ctx.agent.name,
    cwd: ctx.cwd,
  });

  return createResult(ctx, true, output, undefined, Date.now() - start, userPrompt);
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

  let finalArgs = config.args || [];
  if (config.model) {
    finalArgs = [...finalArgs, '--model', config.model];
  }

  let cmdArgs: string[];
  if (config.systemPromptArg) {
    cmdArgs = [config.command, ...finalArgs, config.systemPromptArg, systemPrompt, userPrompt];
  } else {
    const fullPrompt = buildPrompt(systemPrompt, ctx.input, format);
    cmdArgs = config.useStdin
      ? [config.command, ...finalArgs]
      : [config.command, ...finalArgs, fullPrompt];
  }

  if (ctx.verbose) {
    log.plain(`🔧 CLI: ${cmdArgs.slice(0, -1).join(' ')} <prompt ${userPrompt.length} chars>`);
  }

  ensureSigintHandler();

  const proc = Bun.spawn(cmdArgs, {
    stdin: config.useStdin ? 'pipe' : 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, ...config.env },
    cwd: ctx.cwd,
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
    return createResult(ctx, false, '', `Exit code ${proc.exitCode}: ${stderr}`, Date.now() - start, userPrompt);
  }

  return createResult(ctx, true, stdout, undefined, Date.now() - start, userPrompt);
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

        return await executeGenericCli(config, ctx, format);
      } catch (e) {
        return createResult(ctx, false, '', e instanceof Error ? e.message : String(e), Date.now() - start);
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
});

export const testCliExecutor = createCLIExecutor({
  name: 'test-cli',
  description: 'Test stub executor - returns empty array (for testing only)',
  command: 'bash',
  args: ['-c', "cat > /dev/null; sleep 1; echo '[]'"],
  timeout: 10,
  useStdin: true,
});
