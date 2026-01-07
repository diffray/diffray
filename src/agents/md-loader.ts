import type { Agent } from '../types.js';
import {
  parseMarkdown,
  loadMarkdownFile,
  loadMarkdownDirectory,
  type Frontmatter,
} from '../md-loader.js';
import { log } from '../logger.js';

function buildAgent(frontmatter: Frontmatter, body: string): Agent | null {
  const id = frontmatter.id;
  const name = frontmatter.name;

  if (typeof id !== 'string' || typeof name !== 'string') {
    return null;
  }

  const systemPrompt = body.trim();
  if (!systemPrompt) {
    return null;
  }

  const agent: Agent = {
    id,
    name,
    description: typeof frontmatter.description === 'string' ? frontmatter.description : '',
    systemPrompt,
    enabled: typeof frontmatter.enabled === 'boolean' ? frontmatter.enabled : true,
    order: typeof frontmatter.order === 'number' ? frontmatter.order : 0,
    executor: typeof frontmatter.executor === 'string' ? frontmatter.executor : 'default-cli',
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
  return loadMarkdownDirectory(dirPath, buildAgent);
}

export function parseSingleAgent(content: string): Agent | null {
  const agents = parseAgentMarkdown(content);
  return agents.length > 0 ? (agents[0] ?? null) : null;
}
