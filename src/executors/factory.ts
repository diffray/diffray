/**
 * Executor Factory - creation and management of executors
 */

import type {
  AgentExecutor,
  AgentExecutorType,
  LLMAPIAgentExecutor,
  CLIAgentExecutor,
  MCPAgentExecutor,
  ExecutionContext,
  ExecutionResult,
} from "../types";
import { BaseExecutor } from "./base";
import { LLMAPIExecutor } from "./llm-api";
import { CLIExecutor } from "./cli";
import { MCPExecutor } from "./mcp";

/**
 * Executor Factory - factory for creating executors
 */
export class ExecutorFactory {
  private executors: Map<string, BaseExecutor> = new Map();

  /**
   * Register executor
   */
  registerExecutor(config: AgentExecutor): void {
    const executor = this.createExecutor(config);
    if (executor.validate()) {
      this.executors.set(config.id, executor);
    } else {
      throw new Error(`Invalid executor configuration: ${config.id}`);
    }
  }

  /**
   * Get executor by ID
   */
  getExecutor(id: string): BaseExecutor | undefined {
    return this.executors.get(id);
  }

  /**
   * List all executors
   */
  listExecutors(): AgentExecutor[] {
    return Array.from(this.executors.values()).map((e) => e.getInfo());
  }

  /**
   * Remove executor
   */
  removeExecutor(id: string): void {
    this.executors.delete(id);
  }

  /**
   * Execute SubAgent with specified executor
   */
  async executeSubAgent(context: ExecutionContext): Promise<ExecutionResult> {
    const executor = this.executors.get(context.executor.id);
    
    if (!executor) {
      throw new Error(`Executor not found: ${context.executor.id}`);
    }

    if (!executor.isEnabled()) {
      throw new Error(`Executor is disabled: ${context.executor.id}`);
    }

    return await executor.execute(context);
  }

  /**
   * Create executor instance based on type
   */
  private createExecutor(config: AgentExecutor): BaseExecutor {
    switch (config.type) {
      case "llm-api":
        return new LLMAPIExecutor(config as LLMAPIAgentExecutor);
      case "cli":
        return new CLIExecutor(config as CLIAgentExecutor);
      case "mcp":
        return new MCPExecutor(config as MCPAgentExecutor);
      default:
        throw new Error(`Unknown executor type: ${(config as AgentExecutor).type}`);
    }
  }
}

/**
 * Global executor factory instance
 */
export const executorFactory = new ExecutorFactory();

