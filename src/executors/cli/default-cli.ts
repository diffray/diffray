/**
 * Default CLI Executor - stub executor for testing
 */

import type { CLIAgentExecutor } from "../../types";
import { BaseCLIExecutor } from "../base/cli.js";

/**
 * Default CLI Executor (Stub for testing)
 */
export class DefaultCLIExecutor extends BaseCLIExecutor {
  getDefaultConfig(): CLIAgentExecutor {
    return {
      id: "default-cli",
      name: "Default CLI (Stub)",
      description: "Default CLI executor stub for testing - prints prompt preview, waits 5s, returns empty array",
      type: "cli",
      command: "bash",
      args: [
        "-c",
        "PROMPT=$(cat); echo '=== STUB EXECUTOR ===' >&2; echo \"Received prompt (first 200 chars): ${PROMPT:0:200}...\" >&2; echo 'Waiting 5 seconds...' >&2; sleep 5; echo '[]'"
      ],
      timeout: 10,
      enabled: true, // Enabled by default for testing
    };
  }

  /**
   * Default CLI uses stdin
   */
  protected prepareCommand(fullPrompt: string): { commandArgs: string[]; useStdin: boolean } {
    const args = this.cliConfig.args || [];
    return {
      commandArgs: [this.cliConfig.command, ...args],
      useStdin: true,
    };
  }
}
