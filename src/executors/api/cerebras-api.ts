/**
 * Cerebras API Executor - execution via Cerebras AI API (llama-3.3-70b)
 * Fast inference with llama model
 */

import type { LLMAPIAgentExecutor } from "../../types";
import { BaseAPIExecutor } from "../base/api.js";

/**
 * Cerebras API Executor
 */
export class CerebrasAPIExecutor extends BaseAPIExecutor {
  getDefaultConfig(): LLMAPIAgentExecutor {
    return {
      id: "cerebras-api",
      name: "Cerebras API",
      description: "Execute via Cerebras AI API (llama-3.3-70b) - Fast inference",
      type: "llm-api",
      provider: "custom",
      model: "llama-3.3-70b",
      apiKey: process.env.CEREBRAS_API_KEY,
      baseUrl: "https://api.cerebras.ai/v1",
      temperature: 0.7,
      maxTokens: 8192,
      enabled: Boolean(process.env.CEREBRAS_API_KEY),
    };
  }

  /**
   * Make API request to Cerebras
   */
  protected async makeRequest(prompt: string): Promise<string> {
    if (!this.apiConfig.apiKey) {
      throw new Error("CEREBRAS_API_KEY environment variable is not set");
    }

    const url = `${this.apiConfig.baseUrl}/chat/completions`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: this.apiConfig.model,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: this.apiConfig.temperature || 0.7,
        max_tokens: this.apiConfig.maxTokens || 8192,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Cerebras API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0]?.message?.content) {
      throw new Error("Invalid response from Cerebras API");
    }

    return data.choices[0].message.content;
  }
}
