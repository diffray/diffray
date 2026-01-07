/**
 * Base Executor - abstract base class for all executors
 */

import type { AgentExecutor, ExecutionContext, ExecutionResult } from "../../types";

/**
 * Abstract Executor - base class for all executor types
 */
export abstract class BaseExecutor {
  constructor(protected config: AgentExecutor) {}

  /**
   * Get executor default configuration
   * Each concrete executor must implement this to provide its defaults
   */
  abstract getDefaultConfig(): AgentExecutor;

  /**
   * Execute Agent with this executor
   */
  abstract execute(context: ExecutionContext): Promise<ExecutionResult>;

  /**
   * Validate executor configuration
   */
  abstract validate(): boolean;

  /**
   * Get executor info (merged with user config)
   */
  getInfo(): AgentExecutor {
    return this.config;
  }

  /**
   * Check if executor is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Build full prompt from system prompt and input
   */
  protected buildPrompt(systemPrompt: string, input: string): string {
    return `${systemPrompt}\n\n# Input:\n${input}`;
  }

  /**
   * Create execution result
   */
  protected createResult(
    context: ExecutionContext,
    success: boolean,
    output: string,
    error: string | undefined,
    duration: number,
    prompt?: string
  ): ExecutionResult {
    return {
      agentId: context.agent.id,
      agentName: context.agent.name,
      executorId: this.config.id,
      executorName: this.config.name,
      success,
      output,
      error,
      duration,
      prompt,
    };
  }
}
