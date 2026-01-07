/**
 * Token counting utilities
 *
 * To change the token counting implementation:
 * 1. Modify the estimateTokens() function below
 * 2. Or replace with tiktoken for exact counting
 *
 * Example: Using tiktoken for accurate OpenAI token counts
 */

/**
 * Estimate token count for text
 *
 * Current implementation: Simple approximation (1 token ≈ 4 characters)
 *
 * Alternative implementations:
 * - Improved: Math.ceil(text.length / 3.5) - better for code
 * - Tiktoken: Use tiktoken library for exact OpenAI token counts
 */
export function estimateTokens(text: string): number {
  // Simple approximation: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}

/**
 * Get token counter name (for verbose output)
 */
export function getTokenCounterName(): string {
  return 'simple (1 token ≈ 4 chars)';
}

// Example: Using tiktoken for exact counting
// Uncomment and install tiktoken: bun add tiktoken
/*
import { encoding_for_model } from "tiktoken";

const encoder = encoding_for_model("gpt-4");

export function estimateTokens(text: string): number {
  const tokens = encoder.encode(text);
  return tokens.length;
}

export function getTokenCounterName(): string {
  return "tiktoken (gpt-4)";
}
*/
