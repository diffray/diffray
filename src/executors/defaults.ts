/**
 * Default Executors - default executor configurations
 */

import type { AgentExecutor } from "../types";

/**
 * Get default Executors
 */
export function getDefaultExecutors(): AgentExecutor[] {
  return [
    // Default CLI Executor (stub for testing)
    {
      id: "default-cli",
      name: "Default CLI (Stub)",
      description: "Default CLI executor stub for testing - prints prompt preview, waits 5s, returns empty array",
      type: "cli",
      command: "bash",
      args: ["-c", "PROMPT=$(cat); echo '=== STUB EXECUTOR ===' >&2; echo \"Received prompt (first 200 chars): ${PROMPT:0:200}...\" >&2; echo 'Waiting 5 seconds...' >&2; sleep 5; echo '[]'"],
      timeout: 10,
      enabled: true, // Enabled by default for testing
    },
    // Auggie CLI Executor
    {
      id: "auggie-cli",
      name: "Auggie CLI",
      description: "Execute via Auggie CLI agent",
      type: "cli",
      command: "auggie",
      args: ["--print", "--quiet", "--model", "haiku4.5"],
      timeout: 60,
      enabled: false, // Disabled by default - enable in config if you have auggie
    },
    // Claude API Executor
    {
      id: "claude-api",
      name: "Claude API",
      description: "Execute via Anthropic Claude API",
      type: "llm-api",
      provider: "anthropic",
      model: "claude-3-5-sonnet-20241022",
      temperature: 0.7,
      maxTokens: 4096,
      enabled: false, // Disabled by default (requires API key)
    },
    // OpenAI API Executor
    {
      id: "openai-api",
      name: "OpenAI API",
      description: "Execute via OpenAI GPT API",
      type: "llm-api",
      provider: "openai",
      model: "gpt-4",
      temperature: 0.7,
      maxTokens: 4096,
      enabled: false, // Disabled by default (requires API key)
    },
    // Claude Code CLI Executor
    {
      id: "claude-cli",
      name: "Claude Code CLI",
      description: "Execute via Claude Code CLI",
      type: "cli",
      command: "claude",
      args: ["code", "review"],
      timeout: 60,
      enabled: false, // Disabled by default
    },
    // Custom MCP Executor (example)
    {
      id: "custom-mcp",
      name: "Custom MCP Server",
      description: "Execute via custom MCP server",
      type: "mcp",
      serverName: "code-review-server",
      toolName: "review_code",
      config: {
        endpoint: "http://localhost:3000",
      },
      enabled: false, // Disabled by default
    },
  ];
}

