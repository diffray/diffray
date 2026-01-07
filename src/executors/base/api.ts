/**
 * Base API Executor - shared logic for all API-based executors
 */

import type { LLMAPIAgentExecutor, ExecutionContext, ExecutionResult } from "../../types";
import { BaseExecutor } from "./executor.js";

/**
 * Base API Executor - provides common API execution logic
 * Concrete executors extend this and implement getDefaultConfig() and makeRequest()
 */
export abstract class BaseAPIExecutor extends BaseExecutor {
  protected apiConfig: LLMAPIAgentExecutor;

  constructor(userConfig?: Partial<LLMAPIAgentExecutor>) {
    // Get default config from concrete executor (workaround for abstract method)
    const instance = new (this.constructor as any)();
    const defaultConfig = instance.getDefaultConfig() as LLMAPIAgentExecutor;

    // Merge with user config
    const mergedConfig = {
      ...defaultConfig,
      ...userConfig,
    } as LLMAPIAgentExecutor;

    super(mergedConfig);
    this.apiConfig = mergedConfig;
  }

  /**
   * Validate API executor configuration
   */
  validate(): boolean {
    if (!this.apiConfig.provider || !this.apiConfig.model) {
      return false;
    }
    return true;
  }

  /**
   * Execute Agent via API
   */
  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      // Build full prompt
      const fullPrompt = this.buildPrompt(context.systemPrompt, context.input);

      // Make API request (implemented by concrete executor)
      const output = await this.makeRequest(fullPrompt);

      const duration = Date.now() - startTime;

      return this.createResult(
        context,
        true,
        output,
        undefined,
        duration,
        fullPrompt
      );
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
   * Make API request - must be implemented by concrete executors
   */
  protected abstract makeRequest(prompt: string): Promise<string>;
}
