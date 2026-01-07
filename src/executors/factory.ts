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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Executor Factory - factory for creating and managing executors
 */
export class ExecutorFactory {
  private executors: Map<string, BaseExecutor> = new Map();
  private initialized = false;

  /**
   * Auto-discover and register all executors from cli/, api/, mcp/ directories
   */
  async autoDiscover(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Scan executor directories
    const patterns = [
      path.join(__dirname, "cli", "**", "*.ts"),
      path.join(__dirname, "cli", "**", "*.js"),
      path.join(__dirname, "api", "**", "*.ts"),
      path.join(__dirname, "api", "**", "*.js"),
      path.join(__dirname, "mcp", "**", "*.ts"),
      path.join(__dirname, "mcp", "**", "*.js"),
    ];

    for (const pattern of patterns) {
      try {
        const files = await glob(pattern, { absolute: true });

        for (const file of files) {
          try {
            // Import module
            const module = await import(file);

            // Find executor class (convention: class ending with 'Executor')
            const ExecutorClass = Object.values(module).find((exported: any) => {
              return (
                typeof exported === "function" &&
                exported.prototype instanceof BaseExecutor
              );
            }) as any;

            if (ExecutorClass) {
              // Create instance with no config to get defaults
              const instance = new ExecutorClass();
              const config = instance.getDefaultConfig();

              // Register with default config
              this.register(instance, config);
            }
          } catch (error) {
            // Skip files that fail to import
            console.warn(`Failed to load executor from ${file}:`, error);
          }
        }
      } catch (error) {
        // Skip patterns that don't match any files
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
