/**
 * Core types for diffray
 */

/**
 * Source of configuration item (where it was loaded from)
 */
export type ConfigSource = 'defaults' | 'extends' | 'user' | 'project';

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
export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Issue categories
 */
export type IssueCategory = 'security' | 'performance' | 'bug' | 'quality' | 'style' | 'docs';

/**
 * Code issue found by an agent
 */
export interface Issue {
  file: string;
  lineStart: number;
  lineEnd: number;
  severity: IssueSeverity;
  category: IssueCategory;
  shortDescription: string;
  fullDescription: string;
  suggestion?: string;
  agent: string;
  rule?: string; // Rule that triggered this issue
  evidence?: string; // Concrete code proof that demonstrates the issue
  confidence?: number; // Certainty level 0-100 (filtered by --confidence flag)
}

/**
 * Agent - defines agent configuration and behavior
 * systemPrompt: Agent's focus area, specialization, and output format
 * The specific task (WHAT to check) comes from Rule.prompt
 */
export interface Agent {
  name: string;
  description: string;
  systemPrompt: string; // Agent settings: focus area, specialization, output format
  enabled: boolean;
  order: number;

  // Which executor will execute this task (if not set, uses defaultExecutor from config)
  executor?: string;

  // Executor-specific settings (e.g., temperature, model, timeout)
  executorSettings?: Record<string, unknown>;

  // Which stage this agent belongs to (default: 'review')
  stage?: 'review' | 'validation';

  // Where this agent was loaded from
  source?: ConfigSource;

  // Path to source file
  path?: string;
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
  command?: string; // e.g., "auggie", "claude"
  args?: string[]; // Additional arguments
  env?: Record<string, string>; // Environment variables
  timeout?: number; // Timeout in seconds
  model?: string; // Model for CLI tools like claude-cli
  installCommand?: string; // Installation hint (e.g., "npm install -g @anthropic-ai/claude-code")
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
  verbose?: boolean; // Verbose mode flag (raw JSON)
  quiet?: boolean; // Suppress output (for JSON mode)
  stream?: boolean; // Show streaming (thinking, preliminary issues)
  cwd?: string; // Working directory for CLI executors
}

/**
 * Execution Result - execution result
 */
export interface ExecutionResult {
  agent: string;
  executor: string;
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
    baseRef?: string; // Base commit/branch for comparison
    headRef?: string; // Head commit/branch for comparison
    commitMessages?: string[]; // Commit messages in the diff range (for understanding intent)
  };
  verbose?: boolean;
  quiet?: boolean; // Suppress all logs (for JSON output mode)
  stream?: boolean; // Show streaming output (thinking, preliminary issues)
  concurrency: number; // Max concurrent batch executions
  ruleRefs?: RuleRef[]; // Rule refs from load-rules stage (lightweight)
  rules?: Rule[]; // Full rules (deprecated, use ruleRefs)
  agents?: Agent[]; // Loaded agents from load-rules stage
  matchedRules?: MatchedRule[]; // Matched rules from match-rules stage
  skipValidation?: boolean; // Skip validation stage
  // Filtering options
  ruleFilter?: string[]; // Only run these rules (by name)
  excludeRules?: string[]; // Exclude these rules (by name)
  agentFilter?: string[]; // Only run these agents (by name)
  excludeAgents?: string[]; // Exclude these agents (by name)
  // Confidence filtering
  minConfidence?: number; // Minimum confidence threshold (default: 80)
  // Config (loaded once in pipeline)
  config?: import('./config').Config;
}

export interface AgentResult {
  agent: string;
  executor: string;
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
 * Rule reference stored in config (lightweight)
 * Full content (prompt) loaded lazily from path when needed
 */
export interface RuleRef {
  name: string;
  description: string;
  path: string; // Absolute path to MD file
  patterns: string[]; // Array of glob patterns for matching
  agent: string; // Agent ID to use
  source: ConfigSource; // Where this rule was loaded from
}

/**
 * Full rule with content (loaded from RuleRef.path)
 */
export interface Rule {
  name: string;
  description: string;
  patterns: string[]; // Array of glob patterns
  agent: string;
  prompt: string; // Main prompt - what to check for
  source?: ConfigSource; // Where this rule was loaded from
  path?: string; // Path to source file
}

/**
 * Matched rule with files
 */
export interface MatchedRule {
  rule: Rule;
  files: string[];
  agent: Agent;
}
