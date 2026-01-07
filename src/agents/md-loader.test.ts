import { describe, it, expect } from 'bun:test';
import { parseAgentMarkdown, loadAgentsFromDirectory } from './md-loader';

describe('md-loader', () => {
  describe('parseAgentMarkdown', () => {
    it('should correctly parse a complete agent markdown', () => {
      const markdown = `---
id: test-agent
name: Test Agent
description: This is a test agent description.
order: 1
enabled: true
executor: openai
---

You are a helpful assistant.`;

      const result = parseAgentMarkdown(markdown);

      expect(result).toHaveLength(1);
      const agent = result[0];
      if (!agent) throw new Error('Expected agent to be defined');
      expect(agent.id).toBe('test-agent');
      expect(agent.name).toBe('Test Agent');
      expect(agent.enabled).toBe(true);
      expect(agent.executor).toBe('openai');
      expect(agent.description).toBe('This is a test agent description.');
      expect(agent.systemPrompt).toBe('You are a helpful assistant.');
    });

    it('should use default values for missing optional fields', () => {
      const markdown = `---
id: minimal-agent
name: Minimal Agent
---

Minimal prompt.`;

      const result = parseAgentMarkdown(markdown);

      expect(result).toHaveLength(1);
      const agent = result[0];
      if (!agent) throw new Error('Expected agent to be defined');
      expect(agent.id).toBe('minimal-agent');
      expect(agent.name).toBe('Minimal Agent');
      expect(agent.enabled).toBe(true);
      expect(agent.executor).toBe('default-cli');
      expect(agent.description).toBe('');
      expect(agent.systemPrompt).toBe('Minimal prompt.');
    });

    it('should handle missing executor field with default', () => {
      const markdown = `---
id: no-executor
name: No Executor
description: No executor specified.
order: 2
enabled: false
---

Test prompt.`;

      const result = parseAgentMarkdown(markdown);

      expect(result).toHaveLength(1);
      const agent = result[0];
      if (!agent) throw new Error('Expected agent to be defined');
      expect(agent.id).toBe('no-executor');
      expect(agent.name).toBe('No Executor');
      expect(agent.enabled).toBe(false);
      expect(agent.executor).toBe('default-cli');
      expect(agent.description).toBe('No executor specified.');
      expect(agent.systemPrompt).toBe('Test prompt.');
    });

    it('should handle missing description field', () => {
      const markdown = `---
id: no-description
name: No Description
---

Only system prompt.`;

      const result = parseAgentMarkdown(markdown);

      expect(result).toHaveLength(1);
      const agent = result[0];
      if (!agent) throw new Error('Expected agent to be defined');
      expect(agent.id).toBe('no-description');
      expect(agent.name).toBe('No Description');
      expect(agent.description).toBe('');
      expect(agent.systemPrompt).toBe('Only system prompt.');
    });

    it('should handle missing system prompt (body)', () => {
      const markdown = `---
id: no-system-prompt
name: No System Prompt
description: Only description.
---`;

      const result = parseAgentMarkdown(markdown);

      // Should return empty array because systemPrompt is required
      expect(result).toHaveLength(0);
    });

    it('should handle empty markdown gracefully', () => {
      const result = parseAgentMarkdown('');
      expect(result).toHaveLength(0);
    });

    it('should handle invalid frontmatter gracefully (missing required fields)', () => {
      const markdown = `---
invalid: yaml
content: here
---

Test prompt.`;

      const result = parseAgentMarkdown(markdown);
      // Missing required fields (id, name), so should return empty
      expect(result).toHaveLength(0);
    });

    it('should handle markdown without frontmatter', () => {
      const markdown = `Just some text without frontmatter.`;

      const result = parseAgentMarkdown(markdown);
      expect(result).toHaveLength(0);
    });

    it('should handle multiline prompts', () => {
      const markdown = `---
id: multiline-agent
name: Multiline Agent
description: This is a multiline description.
---

You are a helpful assistant.
Your purpose is to assist users.
You should be polite and helpful.`;

      const result = parseAgentMarkdown(markdown);

      expect(result).toHaveLength(1);
      const agent = result[0];
      if (!agent) throw new Error('Expected agent to be defined');
      expect(agent.description).toBe('This is a multiline description.');
      expect(agent.systemPrompt).toContain('You are a helpful assistant.');
      expect(agent.systemPrompt).toContain('Your purpose is to assist users.');
    });

    it('should handle extra whitespace in body', () => {
      const markdown = `---
id: whitespace-agent
name: Whitespace Agent
description: This description has extra whitespace.
---

   This prompt has extra whitespace too.

`;

      const result = parseAgentMarkdown(markdown);

      expect(result).toHaveLength(1);
      const agent = result[0];
      if (!agent) throw new Error('Expected agent to be defined');
      expect(agent.systemPrompt).toBe('This prompt has extra whitespace too.');
    });
  });

  describe('loadAgentsFromDirectory', () => {
    it('should load agents from the defaults directory', async () => {
      const agents = await loadAgentsFromDirectory('src/defaults/agents');

      expect(Array.isArray(agents)).toBe(true);
      expect(agents.length).toBeGreaterThan(0);

      // Verify each agent has required fields
      for (const agent of agents) {
        expect(agent).toHaveProperty('id');
        expect(agent).toHaveProperty('name');
        expect(agent).toHaveProperty('enabled');
        expect(agent).toHaveProperty('executor');
        expect(agent).toHaveProperty('description');
        expect(agent).toHaveProperty('systemPrompt');

        expect(typeof agent.id).toBe('string');
        expect(typeof agent.name).toBe('string');
        expect(typeof agent.enabled).toBe('boolean');
        expect(typeof agent.executor).toBe('string');
        expect(typeof agent.description).toBe('string');
        expect(typeof agent.systemPrompt).toBe('string');

        expect(agent.id.length).toBeGreaterThan(0);
        expect(agent.name.length).toBeGreaterThan(0);
        expect(agent.executor.length).toBeGreaterThan(0);
      }
    });

    it('should return empty array for non-existent directory', async () => {
      const agents = await loadAgentsFromDirectory('./non-existent-directory');
      expect(agents).toEqual([]);
    });

    it('should handle directory with no markdown files', async () => {
      // This test assumes there's an empty directory or creates one
      const agents = await loadAgentsFromDirectory('./empty-test-dir');
      expect(Array.isArray(agents)).toBe(true);
    });
  });
});
