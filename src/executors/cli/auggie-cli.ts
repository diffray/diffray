/**
 * Auggie CLI Executor - execution via Auggie CLI
 */

import type { CLIAgentExecutor } from "../../types";
import { BaseCLIExecutor } from "../base/cli.js";

/**
 * Auggie CLI Executor
 */
export class AuggieCLIExecutor extends BaseCLIExecutor {
  getDefaultConfig(): CLIAgentExecutor {
    return {
      id: "auggie-cli",
      name: "Auggie CLI",
      description: "Execute via Auggie CLI agent",
      type: "cli",
      command: "auggie",
      args: ["--print", "--quiet", "--model", "haiku4.5"],
      timeout: 60,
      enabled: false,
    };
  }

  /**
   * Auggie CLI accepts prompt as last argument
   */
  protected prepareCommand(fullPrompt: string): { commandArgs: string[]; useStdin: boolean } {
    const args = this.cliConfig.args || [];
    return {
      commandArgs: [this.cliConfig.command, ...args, fullPrompt],
      useStdin: false,
    };
  }
}
