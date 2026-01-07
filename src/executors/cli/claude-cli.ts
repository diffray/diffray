/**
 * Claude CLI Executor - execution via Claude Code CLI
 */

import type { CLIAgentExecutor } from "../../types";
import { BaseCLIExecutor } from "../base/cli.js";

/**
 * Claude CLI Executor
 */
export class ClaudeCLIExecutor extends BaseCLIExecutor {
  getDefaultConfig(): CLIAgentExecutor {
    return {
      id: "claude-cli",
      name: "Claude Code CLI",
      description: "Execute via Claude Code CLI",
      type: "cli",
      command: "claude",
      args: ["-p", "--output-format", "json", "--no-session-persistence"],
      timeout: 120,
      enabled: false,
    };
  }

  /**
   * Claude CLI accepts prompt as last argument
   */
  protected prepareCommand(fullPrompt: string): { commandArgs: string[]; useStdin: boolean } {
    const args = this.cliConfig.args || [];
    return {
      commandArgs: [this.cliConfig.command, ...args, fullPrompt],
      useStdin: false,
    };
  }
}
