/**
 * API Executor - executes agents via HTTP API
 */

import { z } from 'zod';
import type { ExecutionContext, ExecutionResult } from '../types';
import type { Executor, APIConfig } from './types';
import { log } from '../logger';
import { fetchWithRetry, loadOutputFormat, buildUserPrompt, createResult } from './utils';

// Settings schema for API executors
export const APISettingsSchema = z.object({
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
});

export function createAPIExecutor(
  config: APIConfig,
  makeRequest: (systemPrompt: string, userPrompt: string, cfg: APIConfig) => Promise<string>
): Executor {
  return {
    name: config.name,
    description: config.description,
    type: 'llm-api',
    enabled: Boolean(config.apiKey),
    async execute(ctx: ExecutionContext): Promise<ExecutionResult> {
      const start = Date.now();
      try {
        const format = await loadOutputFormat();
        const userPrompt = buildUserPrompt(ctx.input, format);

        if (ctx.verbose) {
          log.plain(`🔧 API: ${config.name} (model: ${config.model})`);
        }

        const output = await makeRequest(ctx.systemPrompt, userPrompt, config);

        if (ctx.verbose) {
          log.plain(`📥 API raw response (${output.length} chars):`);
          log.plain(`   ${output.slice(0, 500)}${output.length > 500 ? '...' : ''}`);
        }

        return createResult(ctx, true, output, undefined, Date.now() - start, userPrompt);
      } catch (e) {
        return createResult(
          ctx,
          false,
          '',
          e instanceof Error ? e.message : String(e),
          Date.now() - start
        );
      }
    },
    getInfo: () => ({
      name: config.name,
      description: config.description,
      type: 'llm-api' as const,
      provider: 'custom' as const,
      model: config.model,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      enabled: Boolean(config.apiKey),
    }),

    settingsSchema: APISettingsSchema,

    applySettings: (settings: Record<string, unknown>) => {
      const parsed = APISettingsSchema.safeParse(settings);
      const validSettings = parsed.success ? parsed.data : {};

      return {
        name: config.name,
        description: config.description,
        type: 'llm-api' as const,
        provider: 'custom' as const,
        model: validSettings.model ?? config.model,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        temperature: validSettings.temperature ?? config.temperature,
        maxTokens: validSettings.maxTokens ?? config.maxTokens,
        enabled: Boolean(config.apiKey),
      };
    },
  };
}

// ============ Cerebras API ============

const CEREBRAS_DEFAULTS = {
  model: 'llama-3.3-70b',
  temperature: 0.7,
  maxTokens: 8192,
  baseUrl: 'https://api.cerebras.ai/v1',
} as const;

async function cerebrasRequest(
  systemPrompt: string,
  userPrompt: string,
  cfg: APIConfig
): Promise<string> {
  if (!cfg.apiKey) throw new Error('CEREBRAS_API_KEY not set');

  const res = await fetchWithRetry(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: cfg.temperature || 0.7,
      max_tokens: cfg.maxTokens || 8192,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Cerebras API: ${res.status} - ${error}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content || '';
}

export const cerebrasExecutor = createAPIExecutor(
  {
    name: 'cerebras-api',
    description: 'Execute via Cerebras AI API',
    model: CEREBRAS_DEFAULTS.model,
    apiKey: process.env.CEREBRAS_API_KEY,
    baseUrl: CEREBRAS_DEFAULTS.baseUrl,
    temperature: CEREBRAS_DEFAULTS.temperature,
    maxTokens: CEREBRAS_DEFAULTS.maxTokens,
  },
  cerebrasRequest
);
