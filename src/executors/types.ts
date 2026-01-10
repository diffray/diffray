/**
 * Shared types for executors module
 */

import type { z } from 'zod';
import type { ExecutionContext, ExecutionResult, AgentExecutor } from '../types';

export interface Executor {
  name: string;
  description: string;
  type: 'llm-api' | 'cli';
  enabled: boolean;
  execute: (ctx: ExecutionContext) => Promise<ExecutionResult>;
  getInfo: () => AgentExecutor;

  // Settings schema for validation and type inference
  settingsSchema?: z.ZodType<Record<string, unknown>>;

  // Apply settings override, returns new executor info with merged settings
  applySettings?: (settings: Record<string, unknown>) => AgentExecutor;
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
  /** Installation command hint (e.g., "npm install -g @anthropic-ai/claude-code") */
  installCommand?: string;
}

export interface StreamOptions {
  stream: boolean;
  verbose: boolean;
  agentName?: string;
  cwd?: string;
}
