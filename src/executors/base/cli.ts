/**
 * Base CLI Executor - shared logic for all CLI-based executors
 */

import type { CLIAgentExecutor, ExecutionContext, ExecutionResult } from "../../types";
import { BaseExecutor } from "./executor.js";
import { log } from "../../logger.js";

/**
 * Base CLI Executor - provides common CLI execution logic
 * Concrete executors extend this and implement getDefaultConfig() and optionally prepareCommand()
 */
export abstract class BaseCLIExecutor extends BaseExecutor {
  protected cliConfig: CLIAgentExecutor;

  constructor(userConfig?: Partial<CLIAgentExecutor>) {
    // Temporary placeholder config for super()
    const tempConfig = {
      id: "temp",
      name: "temp",
      description: "temp",
      type: "cli" as const,
      command: "echo",
      enabled: false,
    };
    super(tempConfig);

    // Get actual default config
    const defaultConfig = this.getDefaultConfig();

    // Merge with user config
    const mergedConfig = {
      ...defaultConfig,
      ...userConfig,
    } as CLIAgentExecutor;

    // Update config
    this.config = mergedConfig;
    this.cliConfig = mergedConfig;
  }

  /**
   * Validate CLI executor configuration
   */
  validate(): boolean {
    if (!this.cliConfig.command) {
      return false;
    }
    return true;
  }

  /**
   * Execute Agent via CLI
   */
  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      // Build full prompt
      const fullPrompt = this.buildPrompt(context.systemPrompt, context.input);

      // Prepare command arguments
      const { commandArgs, useStdin } = this.prepareCommand(fullPrompt);

      // Show command in verbose mode
      if (context.verbose) {
        if (useStdin) {
          log.plain(`🔧 CLI command: ${commandArgs.join(" ")}`);
          log.plain(`   Input via stdin (${fullPrompt.length} chars)`);
        } else {
          const cmdWithoutPrompt = commandArgs.slice(0, -1).join(" ");
          log.plain(`🔧 CLI command: ${cmdWithoutPrompt} "<prompt ${fullPrompt.length} chars>"`);
        }
      }

      // Execute CLI command
      const proc = Bun.spawn(commandArgs, {
        stdin: useStdin ? "pipe" : "ignore",
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          ...this.cliConfig.env,
        },
      });

      try {
        // Write to stdin if needed
        if (useStdin) {
          if (!proc.stdin) {
            throw new Error("Process stdin is not available");
          }
          proc.stdin.write(fullPrompt);
          proc.stdin.end();
        }

        // Setup timeout
        const timeout = this.cliConfig.timeout || 60;
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            proc.kill();
            reject(new Error(`CLI execution timeout after ${timeout}s`));
          }, timeout * 1000);
        });

        // Read output streams
        const outputPromise = new Response(proc.stdout).text();
        const errorPromise = new Response(proc.stderr).text();

        // Wait for completion or timeout
        let output: string;
        let error: string;

        try {
          [output, error] = await Promise.race([
            Promise.all([outputPromise, errorPromise]),
            timeoutPromise,
          ]);
        } catch (err) {
          throw err;
        }

        await proc.exited;

        const duration = Date.now() - startTime;

        if (proc.exitCode !== 0) {
          return this.createResult(
            context,
            false,
            "",
            `CLI exited with code ${proc.exitCode}: ${error}`,
            duration,
            fullPrompt
          );
        }

        return this.createResult(
          context,
          true,
          output || `[CLI: ${this.cliConfig.name}] Executed successfully`,
          undefined,
          duration,
          fullPrompt
        );
      } catch (error) {
        try {
          proc.kill();
        } catch {
          // Ignore kill errors
        }

        const duration = Date.now() - startTime;
        return this.createResult(
          context,
          false,
          "",
          error instanceof Error ? error.message : String(error),
          duration
        );
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      return this.createResult(
        context,
        false,
        "",
        error instanceof Error ? error.message : String(error),
        duration
      );
    }
  }

  /**
   * Prepare command arguments - can be overridden by concrete executors
   * Default behavior: pass prompt as last argument
   */
  protected prepareCommand(fullPrompt: string): { commandArgs: string[]; useStdin: boolean } {
    const args = this.cliConfig.args || [];

    // Default: pass prompt as last argument (like auggie, claude)
    return {
      commandArgs: [this.cliConfig.command, ...args, fullPrompt],
      useStdin: false,
    };
  }
}
