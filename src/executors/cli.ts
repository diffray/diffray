/**
 * CLI Executor - execution via CLI commands
 */

import type { CLIAgentExecutor, ExecutionContext, ExecutionResult } from "../types";
import { BaseExecutor } from "./base";
import { log } from "../logger";

/**
 * CLI Executor - isolated CLI agent invocation
 */
export class CLIExecutor extends BaseExecutor {
  private cliConfig: CLIAgentExecutor;

  constructor(config: CLIAgentExecutor) {
    super(config);
    this.cliConfig = config;
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
   * Execute SubAgent via CLI
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
          // For stdin mode, show command without prompt
          log.plain(`🔧 CLI command: ${commandArgs.join(" ")}`);
          log.plain(`   Input via stdin (${fullPrompt.length} chars)`);
        } else {
          // For auggie mode, show command with args but truncate prompt
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
          // Timeout or other error
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
        // Ensure process is killed on error
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
      // Outer catch for spawn errors
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
   * Prepare command arguments based on CLI type
   */
  private prepareCommand(fullPrompt: string): { commandArgs: string[]; useStdin: boolean } {
    const args = this.cliConfig.args || [];

    // Special handling for different CLI tools
    switch (this.cliConfig.command) {
      case "auggie":
        // Auggie expects: auggie --print --quiet "instruction here"
        return {
          commandArgs: [this.cliConfig.command, ...args, fullPrompt],
          useStdin: false,
        };

      case "claude":
        // Claude CLI expects: claude -p --output-format json "instruction here"
        return {
          commandArgs: [this.cliConfig.command, ...args, fullPrompt],
          useStdin: false,
        };

      default:
        // Default: use stdin
        return {
          commandArgs: [this.cliConfig.command, ...args],
          useStdin: true,
        };
    }
  }
}

