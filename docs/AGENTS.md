# Agent Configuration with Markdown

## Overview

Diffray agents can now be defined using simple Markdown files, making them easy to read, write, and maintain. This approach is inspired by Claude's sub-agent system and provides a clean, declarative way to configure your code review agents.

Instead of writing configuration in JSON or code, you can create agents using markdown files with a straightforward structure that includes metadata, descriptions, and system prompts.

## Why Agents?

The agent-based architecture provides two key benefits:

### Focused Analysis
Each agent is a specialist with a single responsibility. A security agent only looks for vulnerabilities. A bug hunter only searches for logic errors. This focus leads to higher quality findings because the agent isn't trying to do everything at once.

### Clean Context
Every agent starts with a fresh context containing only what it needs:
- Its specialized system prompt
- The code diffs relevant to its domain
- The rules that define what to look for

No noise from unrelated checks. No confusion from mixed responsibilities. The agent sees only what matters for its task, which dramatically improves accuracy and reduces false positives.

This is similar to how human code reviewers work best when they focus on one aspect at a time rather than trying to catch every possible issue in a single pass.

## File Format

Each agent is defined in a separate `.md` file with the following structure:

```markdown
# Agent: Your Agent Name

---
ID: your-agent-id
Order: 1
Enabled: true
Executor: claude-cli
---

## Description

A clear description of what this agent does and when it should be used.

## System Prompt

The instructions that define the agent's behavior and focus areas.

### Focus Area 1
- Specific points about this focus area
- Additional details

### Focus Area 2
- More specifics
- Guidelines

### Output Format
Reference ../output-format.md for expected JSON structure.
```

## Field Reference

### Required Fields

**ID** (required)
- Unique identifier for the agent
- Use lowercase with dashes (e.g., `bug-hunter`, `security-scan`)
- Must be unique across all agents

**Agent Name** (required)
- Extracted from the first line: `# Agent: Name`
- Human-readable display name
- Used in reports and logs

### Optional Fields

**Order** (optional, default: 0)
- Number that determines execution order
- Lower numbers run first
- Agents with same order may run in any sequence

**Enabled** (optional, default: true)
- Boolean flag (`true` or `false`)
- Disabled agents are not executed
- Useful for temporarily turning off agents

**Executor** (optional, default: 'test-cli')
- ID of the executor that will run this agent
- Examples: `claude-cli`, `openai-api`, `cerebras-api`
- Must match an available executor

### Sections

**Description**
- Explain what the agent does
- Keep it concise (1-2 sentences)
- Helps users understand the agent's purpose

**System Prompt**
- The core instructions for the agent
- Define focus areas, analysis approach, and output expectations
- Can use `###` subsections for organization
- Should reference `../output-format.md` for structured output

## File Location

### Default Agents
Default agents are located in:
```
src/defaults/agents/*.md
```

These agents are loaded automatically and can be used as examples.

### Custom Agents
You can add custom agents to the same directory. The system will load all `.md` files and sort them by order.

### One Agent Per File
Each `.md` file should contain exactly one agent definition. Use descriptive filenames like `bug-hunter.md`, `security-scan.md`.

## Creating Custom Agents

Follow these steps to create a custom agent:

### 1. Copy the Template
Start with the `EXAMPLE.md` template in `src/defaults/agents/`:
```bash
cp src/defaults/agents/EXAMPLE.md src/defaults/agents/my-agent.md
```

### 2. Set Unique ID
Choose a unique ID that describes your agent:
```markdown
ID: typescript-checker
```

### 3. Write Description
Clearly explain what your agent does:
```markdown
## Description

Analyzes TypeScript code for type safety issues and best practices.
```

### 4. Write System Prompt
Define the agent's instructions and focus areas:
```markdown
## System Prompt

You are a TypeScript expert specializing in type safety and modern TypeScript patterns.

### Focus Areas
- Type inference issues
- Missing type annotations
- Use of `any` type
- Generic type usage
```

### 5. Configure Executor and Order
Set which executor to use and when to run:
```markdown
Order: 5
Executor: claude-cli
```

### 6. Enable or Disable
Control whether the agent runs:
```markdown
Enabled: true
```

## Using Subsections in System Prompt

You can organize your system prompt using `###` subsections. These subsections help structure the agent's instructions and make them easier to read:

```markdown
## System Prompt

You are a security expert analyzing code for vulnerabilities.

### Authentication & Authorization
- Check for proper authentication mechanisms
- Verify authorization checks
- Look for session management issues

### Input Validation
- Identify missing input validation
- Check for SQL injection risks
- Look for XSS vulnerabilities

### Output Format
Return findings as JSON array per ../output-format.md
```

The parser will include all subsections as part of the system prompt.

## Examples

### Example 1: Bug Hunter Agent

```markdown
# Agent: Bug Hunter

---
ID: bug-hunter
Order: 1
Enabled: true
Executor: claude-cli
---

## Description

Detects bugs, logic errors and runtime issues that will cause code to fail or behave incorrectly.

## System Prompt

You are a bug detection specialist focused on identifying logic errors and runtime issues.

### Focus Areas
- Null/undefined safety and potential NPE
- Logic errors and incorrect conditionals
- Edge cases and boundary conditions
- Async/concurrency issues

### Output Format
Reference ../output-format.md for JSON structure.
```

### Example 2: Security Scanner

```markdown
# Agent: Security Scanner

---
ID: security-scan
Order: 2
Enabled: false
Executor: test-cli
---

## Description

Scans code for security vulnerabilities and potential security risks.

## System Prompt

You are a security expert identifying vulnerabilities in code.

### Authentication
- Verify proper auth mechanisms
- Check for auth bypasses
- Review session management

### Injection Vulnerabilities
- SQL injection risks
- XSS vulnerabilities
- Command injection

### Output Format
Structure findings per ../output-format.md
```

## Best Practices

### Clear and Specific Prompts
- Be specific about what the agent should focus on
- Avoid vague instructions like "check for problems"
- Use concrete examples when helpful

### Well-Defined Focus Areas
- Break down the agent's responsibilities into clear focus areas
- Use subsections to organize related checks
- Keep each focus area manageable

### Reference Output Format
- Always reference `../output-format.md` in your system prompt
- This ensures consistent JSON output across all agents
- Helps agents understand expected structure

### One Responsibility Per Agent
- Each agent should have a clear, focused purpose
- Don't create "do everything" agents
- Multiple specialized agents work better than one generalist

### Use Appropriate Executors
- Choose executors based on the agent's requirements
- Consider cost, speed, and capability trade-offs
- Test with different executors to find the best fit

### Order Agents Strategically
- Run cheaper/faster agents first to catch obvious issues
- Save expensive/comprehensive agents for later
- Consider dependencies between agents

### Test Your Agents
- Start with `Enabled: false` while testing
- Verify output format matches expectations
- Adjust prompts based on results
- Enable only when ready for production use

## Loading Process

The system loads agents in this order:

1. **Scan markdown files**: Reads all `.md` files from `src/defaults/agents/`
2. **Parse each file**: Extracts metadata, description, and system prompt
3. **Validate agents**: Ensures required fields are present
4. **Sort by order**: Orders agents by their `Order` field
5. **Fallback to hardcoded**: If no markdown agents found, uses hardcoded defaults

This means you can gradually migrate to markdown files or mix both approaches.

## Troubleshooting

### Agent Not Loading
- Check that the file has `.md` extension
- Verify the file is in `src/defaults/agents/`
- Ensure `ID` and name are present
- Check for syntax errors in frontmatter

### Agent Not Running
- Verify `Enabled: true` in frontmatter
- Check that the specified executor exists
- Review order value (lower runs first)

### Incorrect Output
- Review system prompt clarity
- Ensure reference to output-format.md
- Test with different executors
- Add more specific focus areas

## Migration from Hardcoded Agents

To migrate existing hardcoded agents to markdown:

1. Create a new `.md` file for each agent
2. Copy the agent's system prompt to the System Prompt section
3. Set the same ID, order, and executor
4. Add a clear description
5. Test the markdown version
6. Remove the hardcoded version when ready

The system will automatically prefer markdown agents over hardcoded ones.
