/**
 * Shared types for executors module
 */

import type { ExecutionContext, ExecutionResult, AgentExecutor } from '../types';

export interface Executor {
  name: string;
  description: string;
  type: 'llm-api' | 'cli';
  enabled: boolean;
  execute: (ctx: ExecutionContext) => Promise<ExecutionResult>;
  getInfo: () => AgentExecutor;
}

export interface APIConfig {
  name: string;
  description: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface CLIConfig {
  name: string;
  description: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  timeout?: number;
  useStdin?: boolean;
  model?: string;
  systemPromptArg?: string;
}

export interface StreamOptions {
  stream: boolean;
  verbose: boolean;
  agentName?: string;
  cwd?: string;
}
