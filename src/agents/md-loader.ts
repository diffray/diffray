import type { Agent } from '../types.js';
import { parseMarkdown, loadMarkdownFile, type Frontmatter } from '../md-loader.js';
import { log } from '../logger.js';

export function buildAgent(frontmatter: Frontmatter, body: string): Agent | null {
  const name = frontmatter.name;

  if (typeof name !== 'string') {
    return null;
  }

  const systemPrompt = body.trim();
  if (!systemPrompt) {
    return null;
  }

  // Parse executorSettings if present (must be an object)
  const executorSettings =
    frontmatter.executorSettings &&
    typeof frontmatter.executorSettings === 'object' &&
    !Array.isArray(frontmatter.executorSettings)
      ? (frontmatter.executorSettings as Record<string, unknown>)
      : undefined;

  // Parse stage (default: 'review')
  const stage = frontmatter.stage === 'validation' ? 'validation' : 'review';

  const agent: Agent = {
    name,
    description: typeof frontmatter.description === 'string' ? frontmatter.description : '',
    systemPrompt,
    enabled: typeof frontmatter.enabled === 'boolean' ? frontmatter.enabled : true,
    order: typeof frontmatter.order === 'number' ? frontmatter.order : 0,
    executor: typeof frontmatter.executor === 'string' ? frontmatter.executor : 'test-cli',
    stage,
    ...(executorSettings && { executorSettings }),
  };

  return agent;
}

export function parseAgentMarkdown(content: string): Agent[] {
  return parseMarkdown(content, buildAgent);
}

export async function loadAgentMarkdown(filePath: string): Promise<Agent[]> {
  try {
    return await loadMarkdownFile(filePath, buildAgent);
  } catch (error) {
    log.error(`Error loading agent markdown from ${filePath}:`, error);
    return [];
  }
}

export async function loadAgentsFromDirectory(dirPath: string): Promise<Agent[]> {
  const { glob } = await import('glob');
  const { join } = await import('node:path');

  try {
    const mdFiles = await glob('*.md', { cwd: dirPath });
    const agents: Agent[] = [];
    const failedFiles: string[] = [];

    const results = await Promise.all(
      mdFiles.map(async (file) => {
        const filePath = join(dirPath, file);
        try {
          const loaded = await loadMarkdownFile(filePath, buildAgent);
          return { agents: loaded.map((a) => ({ ...a, path: filePath })), failed: null };
        } catch (error) {
          log.error(`Error loading agent from ${file}:`, error);
          return { agents: [], failed: file };
        }
      })
    );

    agents.push(...results.flatMap((r) => r.agents));
    failedFiles.push(...results.map((r) => r.failed).filter((f): f is string => f !== null));

    if (failedFiles.length > 0) {
      log.warn(
        `Loaded ${agents.length}/${mdFiles.length} agents, ${failedFiles.length} failed: ${failedFiles.join(', ')}`
      );
    }

    return agents;
  } catch (error) {
    // Directory doesn't exist - return empty
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export function parseSingleAgent(content: string): Agent | null {
  const agents = parseAgentMarkdown(content);
  return agents.length > 0 ? (agents[0] ?? null) : null;
}
