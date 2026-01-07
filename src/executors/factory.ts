/**
 * Executor Factory - creation and management of executors with auto-discovery
 */

import { glob } from "glob";
import path from "path";
import { fileURLToPath } from "url";
import type {
  AgentExecutor,
  ExecutionContext,
  ExecutionResult,
} from "../types";
import { BaseExecutor } from "./base/executor.js";

// Import all executors explicitly for reliability
import { ClaudeCLIExecutor } from "./cli/claude-cli.js";
import { AuggieCLIExecutor } from "./cli/auggie-cli.js";
import { DefaultCLIExecutor } from "./cli/default-cli.js";
import { ClaudeAPIExecutor } from "./api/claude-api.js";
import { OpenAIAPIExecutor } from "./api/openai-api.js";
import { CerebrasAPIExecutor } from "./api/cerebras-api.js";
import { CustomMCPExecutor } from "./mcp/custom-mcp.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// List of all executor classes
const EXECUTOR_CLASSES = [
  ClaudeCLIExecutor,
  AuggieCLIExecutor,
  DefaultCLIExecutor,
  ClaudeAPIExecutor,
  OpenAIAPIExecutor,
  CerebrasAPIExecutor,
  CustomMCPExecutor,
];

/**
 * Executor Factory - factory for creating and managing executors
 */
export class ExecutorFactory {
  private executors: Map<string, BaseExecutor> = new Map();
  private initialized = false;

  /**
   * Auto-discover and register all executors
   * Uses explicit imports for reliability in compiled binaries
   */
  async autoDiscover(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Register all executor classes
    for (const ExecutorClass of EXECUTOR_CLASSES) {
      try {
        const instance = new ExecutorClass();
        const config = instance.getDefaultConfig();
        this.register(instance, config);
      } catch (error) {
        if (process.env.DEBUG) {
          console.warn(`Failed to register executor ${ExecutorClass.name}:`, error);
        }
      }
    }

    this.initialized = true;
  }

  /**
   * Register executor with optional user config override
   */
  register(executor: BaseExecutor, userConfig?: Partial<AgentExecutor>): void {
    const config = executor.getDefaultConfig();
    const mergedConfig = userConfig ? { ...config, ...userConfig } : config;

    // Create new instance with merged config if user config provided
    const finalExecutor = userConfig
      ? new (executor.constructor as any)(userConfig)
      : executor;

    if (finalExecutor.validate()) {
      this.executors.set(mergedConfig.id, finalExecutor);
    } else {
      throw new Error(`Invalid executor configuration: ${mergedConfig.id}`);
    }
  }

  /**
   * Register executor from config (legacy compatibility)
   */
  registerExecutor(config: AgentExecutor): void {
    // Find registered executor by id
    const executor = this.executors.get(config.id);

    if (executor) {
      // Re-register with new config
      this.register(executor, config);
    } else {
      throw new Error(`Executor not found for registration: ${config.id}`);
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
   * Execute Agent with specified executor
   */
  async executeAgent(context: ExecutionContext): Promise<ExecutionResult> {
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
   * Merge user config with executor defaults
   */
  mergeConfig(executorId: string, userConfig?: Partial<AgentExecutor>): AgentExecutor | null {
    const executor = this.executors.get(executorId);
    if (!executor) return null;

    const defaultConfig = executor.getDefaultConfig();
    return userConfig ? { ...defaultConfig, ...userConfig } : defaultConfig;
  }
}

/**
 * Global executor factory instance
 */
export const executorFactory = new ExecutorFactory();
