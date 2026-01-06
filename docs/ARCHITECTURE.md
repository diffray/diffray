# Architecture: SubAgents + Executors

## Concept

Two-level separation:

1. **SubAgent** - system prompt/instruction (WHAT to do)
2. **Agent Executor** - isolated executor (HOW to do it)

## Benefits

### 1. Separation of Concerns
- **SubAgent** is responsible only for the task and prompt
- **Agent Executor** is responsible only for the execution method

### 2. Reusability
- One SubAgent can use different Executors
- One Executor can execute different SubAgents

### 3. Isolation
- Each Executor is isolated in its own file
- Easy to add new Executor types (API, CLI, MCP, WebSocket, etc.)

### 4. Flexibility
- Can change Executor for SubAgent without changing the prompt
- Can A/B test different Executors for the same task

## Examples

### SubAgent: Code Review

```json
{
  "id": "code-review",
  "name": "Code Review",
  "description": "Reviews code changes for potential issues",
  "systemPrompt": "You are a code reviewer. Analyze the following code changes...",
  "enabled": true,
  "order": 1,
  "executorId": "auggie-cli"
}
```

### Agent Executor: Auggie CLI

```json
{
  "id": "auggie-cli",
  "name": "Auggie CLI",
  "description": "Execute via Auggie CLI agent",
  "type": "cli",
  "command": "auggie",
  "args": ["--print", "--quiet"],
  "timeout": 60,
  "enabled": true
}
```

## Executor Types

### 1. CLI Executor

Executes SubAgents via CLI commands.

**Configuration:**
```typescript
{
  type: "cli",
  command: "auggie",
  args: ["--print", "--quiet"],
  env: { "API_KEY": "..." },
  timeout: 60
}
```

**Supported CLI tools:**
- `auggie` - Augment's CLI agent
- `claude` - Claude Code CLI
- Custom CLI tools

### 2. LLM API Executor

Executes SubAgents via LLM API calls.

**Configuration:**
```typescript
{
  type: "llm-api",
  provider: "anthropic",
  model: "claude-3-5-sonnet-20241022",
  apiKey: "sk-...",
  temperature: 0.7,
  maxTokens: 4096
}
```

**Supported providers:**
- `anthropic` - Claude API
- `openai` - GPT API
- `custom` - Custom API endpoint

### 3. MCP Executor

Executes SubAgents via Model Context Protocol servers.

**Configuration:**
```typescript
{
  type: "mcp",
  serverName: "code-review-server",
  toolName: "review_code",
  config: { ... }
}
```

## Usage

### Registering Executors

```typescript
import { executorFactory } from "./executors/factory";
import { getDefaultExecutors } from "./executors/defaults";

const executors = getDefaultExecutors();
for (const executor of executors) {
  executorFactory.registerExecutor(executor);
}
```

### Registering SubAgents

```typescript
import { subAgentRegistry } from "./subagents/registry";
import { getDefaultSubAgents } from "./subagents/defaults";

const subAgents = getDefaultSubAgents();
for (const subAgent of subAgents) {
  subAgentRegistry.registerSubAgent(subAgent);
}
```

### Executing SubAgents

```typescript
const context: ExecutionContext = {
  subAgent,
  executor: executor.getInfo(),
  input: diffsText,
  systemPrompt: subAgent.systemPrompt,
};

const result = await executorFactory.executeSubAgent(context);
```

## File Structure

```
src/
├── executors/
│   ├── base.ts          # Base executor class
│   ├── cli.ts           # CLI executor
│   ├── llm-api.ts       # LLM API executor
│   ├── mcp.ts           # MCP executor
│   ├── factory.ts       # Executor factory
│   └── defaults.ts      # Default executors
├── subagents/
│   ├── registry.ts      # SubAgent registry
│   └── defaults.ts      # Default SubAgents
└── types.ts             # Type definitions
```

