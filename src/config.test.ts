import { test, expect, describe } from "bun:test";
import { ConfigSchema, getDefaultConfig } from "./config";

describe("Config", () => {
  test("should create default config", () => {
    const config = getDefaultConfig();
    
    expect(config.ai.provider).toBe("none");
    expect(config.review.autoReview).toBe(false);
    expect(config.review.includeTests).toBe(true);
    expect(config.output.colorize).toBe(true);
  });

  test("should validate config schema", () => {
    const validConfig = {
      ai: {
        provider: "openai",
        apiKey: "test-key",
        model: "gpt-4",
      },
      review: {
        autoReview: true,
        includeTests: false,
        maxFilesPerReview: 5,
        excludePatterns: ["*.test.ts"],
      },
      output: {
        colorize: false,
        verbose: true,
        format: "json",
      },
    };

    const result = ConfigSchema.parse(validConfig);
    expect(result.ai.provider).toBe("openai");
    expect(result.review.maxFilesPerReview).toBe(5);
  });

  test("should use defaults for missing values", () => {
    const partialConfig = {
      ai: {
        provider: "anthropic",
      },
    };

    const result = ConfigSchema.parse(partialConfig);
    expect(result.ai.provider).toBe("anthropic");
    expect(result.review.autoReview).toBe(false); // default
    expect(result.output.colorize).toBe(true); // default
  });
});

