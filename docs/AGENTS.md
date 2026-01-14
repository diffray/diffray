# Agent Configuration with Markdown

## Overview

Diffray agents are defined using simple Markdown files. Each agent is a specialist with a focused responsibility - a security agent looks for vulnerabilities, a bug hunter searches for logic errors.

## File Format

Each agent is defined in a `.md` file with YAML frontmatter:

```markdown
---
name: bug-hunter
description: Detects bugs, logic errors and runtime issues
enabled: true
executor: claude-cli
---

You are a bug detection specialist focused on identifying logic errors.

### Focus Areas
- Null/undefined safety
- Logic errors and incorrect conditionals
- Edge cases and boundary conditions
```

**That's it!** The body after frontmatter becomes the agent's system prompt.

## Field Reference

### Required Fields

| Field | Description |
|-------|-------------|
| `name` | Unique identifier (lowercase with dashes: `bug-hunter`) |
| `description` | Short description of what the agent does |
| `executor` | Which executor runs this agent (`claude-cli`, `codex-cli`, `cursor-agent-cli`, `opencode-cli`, `cerebras-api`) |

### Optional Fields

| Field | Default | Description |
|-------|---------|-------------|
| `enabled` | `true` | Whether the agent is active |
| `order` | `0` | Execution order (lower runs first) |

## File Locations

Agents are loaded from three locations (in priority order):

1. **User agents**: `~/.diffray/agents/*.md`
2. **Project agents**: `.diffray/agents/*.md`
3. **Built-in agents**: `src/defaults/agents/*.md`

Higher priority sources override lower ones with the same name.

## Creating Custom Agents

### 1. Create the file

```bash
# User-level agent (applies to all projects)
mkdir -p ~/.diffray/agents
touch ~/.diffray/agents/my-agent.md

# Or project-level agent
mkdir -p .diffray/agents
touch .diffray/agents/my-agent.md
```

### 2. Add frontmatter and prompt

```markdown
---
name: typescript-checker
description: Analyzes TypeScript code for type safety issues
enabled: true
executor: claude-cli
---

You are a TypeScript expert specializing in type safety.

### Focus Areas
- Type inference issues
- Missing type annotations
- Use of `any` type
- Generic type usage

### Instructions
- Only report actual type safety issues
- Be concise and actionable
```

### 3. Verify

```bash
diffray agents list
```

## Examples

### Bug Hunter

```markdown
---
name: bug-hunter
description: Detects bugs, logic errors and runtime issues
enabled: true
executor: claude-cli
---

You are a bug detection specialist focused on identifying logic errors and runtime issues.

**Focus Areas**:
- **Null/Undefined Safety**: Missing null checks, potential NPE
- **Logic Errors**: Incorrect conditionals, wrong operators, off-by-one errors
- **Edge Cases**: Empty arrays, boundary conditions
- **Async/Concurrency**: Race conditions, unhandled promise rejections

**Instructions**:
- ONLY report issues likely to cause runtime errors
- Focus on "will this crash or produce wrong results?"
- Provide evidence: what input will break it?
```

### Security Scanner

```markdown
---
name: security-scan
description: Scans for security vulnerabilities
enabled: true
executor: claude-cli
---

You are a security engineer performing focused security audits.

**Focus Areas**:
- **Injection Attacks**: SQL, XSS, command injection
- **Authentication**: bypass, privilege escalation
- **Secrets**: hardcoded credentials, key exposure
- **Data Protection**: sensitive data exposure, PII leakage

**Quality Standards**:
- Only flag issues with high confidence of actual exploitability
- Every finding must have a concrete attack path
```

## Best Practices

### One Responsibility Per Agent
Each agent should have a clear, focused purpose. Multiple specialized agents work better than one generalist.

### Clear Instructions
Be specific about what the agent should focus on. Avoid vague instructions like "check for problems".

### Test Before Enabling
Start with `enabled: false` while testing. Enable only when ready.

### Order Strategically
Run faster/cheaper agents first. Consider dependencies between agents.

## Managing Agents

```bash
# List all agents
diffray agents

# Show agent details
diffray agents bug-hunter
```

## Troubleshooting

### Agent Not Loading
- Check `.md` extension
- Verify file location (`~/.diffray/agents/`, `.diffray/agents/`, or `src/defaults/agents/`)
- Check YAML frontmatter syntax
- Run `diffray agents list` to verify it's being loaded

### Agent Not Running
- Verify `enabled: true`
- Check executor exists: `diffray executors list`
- Review order value

### Incorrect Output
- Review system prompt clarity
- Add more specific focus areas
- Test with different executors
