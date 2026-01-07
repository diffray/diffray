/**
 * Claude API Executor - execution via Anthropic Claude API
 */

import type { LLMAPIAgentExecutor } from "../../types";
import { BaseAPIExecutor } from "../base/api.js";

/**
 * Claude API Executor
 */
export class ClaudeAPIExecutor extends BaseAPIExecutor {
  getDefaultConfig(): LLMAPIAgentExecutor {
    return {
      id: "claude-api",
      name: "Claude API",
      description: "Execute via Anthropic Claude API",
      type: "llm-api",
      provider: "anthropic",
      model: "claude-3-5-sonnet-20241022",
      temperature: 0.7,
      maxTokens: 4096,
      enabled: false,
    };
  }

  /**
   * Make API request to Anthropic Claude
   */
  protected async makeRequest(prompt: string): Promise<string> {
    // TODO: Implement Anthropic API call
    // For now, return demo output
    await new Promise((resolve) => setTimeout(resolve, 100));

    return `[LLM API: ${this.apiConfig.name}] Demo output for Anthropic Claude\n\nPrompt received: ${prompt.substring(0, 100)}...`;
  }
}
