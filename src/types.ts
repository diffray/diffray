/**
 * Core types for diffray
 */

export interface GitDiff {
  file: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed';
  diff: string;
  additions: number;
  deletions: number;
  hash?: string; // Optional hash for deduplication
}

/**
 * Issue severity levels
 */
export type IssueSeverity = 'error' | 'warning' | 'info' | 'suggestion';

/**
 * Code issue found by an agent
 */
export interface Issue {
  file: string;
  lineStart: number;
  lineEnd: number;
  severity: IssueSeverity;
  shortDescription: string;
  fullDescription: string;
  suggestion?: string;
  agentId: string;
  agentName: string;
}

/**
 * Agent - defines agent configuration and behavior
 * systemPrompt: Agent's focus area, specialization, and output format
 * The specific task (WHAT to check) comes from Rule.prompt
 */
export interface Agent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string; // Agent settings: focus area, specialization, output format
  enabled: boolean;
  order: number;

  // Which executor will execute this task
  executor: string;
}

/**
 * Agent Executor Type - how the agent is executed
 */
export type AgentExecutorType = 'llm-api' | 'cli' | 'mcp';

/**
 * Base Agent Executor - isolated executor
 * Defines HOW to execute the task
 */
export interface BaseAgentExecutor {
  id: string;
  name: string;
  description: string;
  type: AgentExecutorType;
  enabled: boolean;
}

/**
 * LLM API Agent Executor - execution via API
 */
export interface LLMAPIAgentExecutor extends BaseAgentExecutor {
  type: 'llm-api';
  provider: 'anthropic' | 'openai' | 'custom';
  model: string; // e.g., "claude-3-5-sonnet", "gpt-4"
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * CLI Agent Executor - execution via CLI
 */
export interface CLIAgentExecutor extends BaseAgentExecutor {
  type: 'cli';
  command: string; // e.g., "auggie", "claude"
  args?: string[]; // Additional arguments
  env?: Record<string, string>; // Environment variables
  timeout?: number; // Timeout in seconds
}

/**
 * MCP Agent Executor - execution via MCP
 */
export interface MCPAgentExecutor extends BaseAgentExecutor {
  type: 'mcp';
  serverName: string; // MCP server name
  toolName: string; // Tool name in MCP
  config?: Record<string, unknown>; // MCP configuration
}

/**
 * Agent Executor - any executor type
 */
export type AgentExecutor = LLMAPIAgentExecutor | CLIAgentExecutor | MCPAgentExecutor;

/**
 * Execution Context - Agent execution context
 */
export interface ExecutionContext {
  agent: Agent;
  executor: AgentExecutor;
  input: string; // Input data (diffs)
  systemPrompt: string; // System prompt from Agent
  verbose?: boolean; // Verbose mode flag
}

/**
 * Execution Result - execution result
 */
export interface ExecutionResult {
  agentId: string;
  agentName: string;
  executor: string;
  executorName: string;
  success: boolean;
  output: string;
  error?: string;
  duration: number;
  prompt?: string; // Full prompt (for verbose mode)
}

export interface PipelineContext {
  diffs: GitDiff[];
  results: AgentResult[];
  issues: Issue[];
  metadata: {
    timestamp: number;
    repository: string;
    branch?: string;
  };
  verbose?: boolean;
  quiet?: boolean; // Suppress all logs (for JSON output mode)
  concurrency: number; // Max concurrent batch executions
  matchedRules?: MatchedRule[]; // Matched rules from match-rules stage
}

export interface AgentResult {
  agentId: string;
  agentName: string;
  executor: string;
  executorName: string;
  success: boolean;
  output: string;
  error?: string;
  duration: number;
  prompt?: string;
  issues: Issue[];
}

export interface PipelineResult {
  success: boolean;
  context: PipelineContext;
  totalDuration: number;
  stages: StageResult[];
}

/**
 * Stage - a phase in the pipeline execution
 */
export interface Stage {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  order: number;
  execute: (context: PipelineContext) => Promise<StageResult>;
}

/**
 * Result of a stage execution
 */
export interface StageResult {
  stageId: string;
  stageName: string;
  success: boolean;
  duration: number;
  output?: unknown;
  error?: string;
}

/**
 * Rule for matching agents to files
 */
export interface Rule {
  id: string;
  name: string;
  description: string;
  patterns: string[]; // Array of glob patterns
  agent: string;
  prompt: string; // Main prompt - what to check for
}

/**
 * Matched rule with files
 */
export interface MatchedRule {
  rule: Rule;
  files: string[];
  agent: Agent;
}
