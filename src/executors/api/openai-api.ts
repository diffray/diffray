/**
 * OpenAI API Executor - execution via OpenAI GPT API
 */

import type { LLMAPIAgentExecutor } from "../../types";
import { BaseAPIExecutor } from "../base/api.js";

/**
 * OpenAI API Executor
 */
export class OpenAIAPIExecutor extends BaseAPIExecutor {
  getDefaultConfig(): LLMAPIAgentExecutor {
    return {
      id: "openai-api",
      name: "OpenAI API",
      description: "Execute via OpenAI GPT API",
      type: "llm-api",
      provider: "openai",
      model: "gpt-4",
      temperature: 0.7,
      maxTokens: 4096,
      enabled: false,
    };
  }

  /**
   * Make API request to OpenAI
   */
  protected async makeRequest(prompt: string): Promise<string> {
    // TODO: Implement OpenAI API call
    // For now, return demo output
    await new Promise((resolve) => setTimeout(resolve, 100));

    return `[LLM API: ${this.apiConfig.name}] Demo output for OpenAI\n\nPrompt received: ${prompt.substring(0, 100)}...`;
  }
}
