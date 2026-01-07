# Architecture: Agents + Executors

## Concept

Two-level separation:

1. **Agent** - system prompt/instruction (WHAT to do)
2. **Agent Executor** - isolated executor (HOW to do it)

## Benefits

### 1. Separation of Concerns
- **Agent** is responsible only for the task and prompt
- **Agent Executor** is responsible only for the execution method

### 2. Reusability
- One Agent can use different Executors
- One Executor can execute different Agents

### 3. Isolation
- Each Executor is isolated in its own file
- Easy to add new Executor types (API, CLI, WebSocket, etc.)

### 4. Flexibility
- Can change Executor for Agent without changing the prompt
- Can A/B test different Executors for the same task

## Examples

### Agent: Code Review

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

Executes Agents via CLI commands.

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

Executes Agents via LLM API calls.

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
- `cerebras` - Cerebras API
- `custom` - Custom API endpoint

## Global Singletons

The project uses global singletons for state management:

```typescript
executorFactory  // src/executors/factory.ts - executor registry
agentRegistry    // src/agents/registry.ts - agent registry
configCache      // src/config.ts - config cache
```

**Why singletons are OK here:**
- CLI runs once, does work, exits — no parallel pipelines
- One process = one configuration context
- Simpler than passing dependencies through 5+ call levels
- `factory.reset()` available for test isolation

**When singletons would be problematic:**
- Library with multiple independent instances
- Server handling parallel requests with different configs
- Plugin architecture requiring sandboxed execution

## Usage

### Registering Executors

```typescript
import { executorFactory } from "./executors/factory";

// Auto-discover and register all executors
await executorFactory.autoDiscover();
```

### Registering Agents

```typescript
import { agentRegistry } from "./agents/registry";
import { getDefaultAgents } from "./agents/defaults";

const agents = getDefaultAgents();
for (const agent of agents) {
  agentRegistry.register(agent);
}
```

### Executing Agents

```typescript
const context: ExecutionContext = {
  agent,
  executor: executor.getInfo(),
  input: diffsText,
  systemPrompt: agent.systemPrompt,
};

const result = await executorFactory.executeAgent(context);
```

## Stage Pipeline Architecture

The pipeline uses a **stage-based architecture** for extensibility:

```
src/stages/
├── index.ts              # Stage registry & ordering
├── load-rules.ts         # Stage 1: Load rules from config
├── match-rules.ts        # Stage 2: Match files to rules
├── execute-agents.ts     # Stage 3: Run agents (main logic)
├── aggregate-results.ts  # Stage 4: Combine results
├── deduplication.ts      # Stage 5: Remove duplicates
└── validation.ts         # Stage 6: Validate output
```

**Why stages instead of direct function calls?**

```typescript
// Could be simpler:
const rules = await loadRules();
const matched = matchRules(rules, diffs);
const results = await executeAgents(matched);
// ...

// But stages enable:
// 1. Add new stage by adding file (like executors)
// 2. Enable/disable stages via config
// 3. Reorder stages via config
// 4. Timing/logging per stage
// 5. Future: hooks before/after stages
```

**Stage interface:**
```typescript
interface Stage {
  id: string;
  name: string;
  enabled: boolean;
  execute: (context: PipelineContext) => Promise<StageResult>;
}
```

**Configuration (order matters):**
```typescript
// stages order defined in BUILTIN_STAGES array
const BUILTIN_STAGES = [
  createLoadRulesStage,      // must be first
  createMatchRulesStage,     // needs rules
  createExecuteAgentsStage,  // needs matched rules
  createAggregateResultsStage,
  createDeduplicationStage,
  createValidationStage,     // must be last
];

// User can enable/disable via config.stages
{ id: "deduplication", enabled: false }
```

**Example: Adding GitHub integration stage:**
```typescript
// src/stages/github-publish.ts
export function createGitHubPublishStage(): Stage {
  return {
    id: "github-publish",
    name: "Publish to GitHub",
    enabled: true,
    execute: async (context) => {
      // Post issues as PR comments
      await postToGitHub(context.issues);
      return { success: true, ... };
    },
  };
}

// Add to BUILTIN_STAGES after validation
```

**Trade-off:** More abstraction than needed today, but enables future extensibility without refactoring.

## CLI Command Architecture

The CLI uses a **command registry pattern** to avoid monolithic switch statements:

```
src/
├── cli.ts                        # Main entry point (~200 lines)
└── cli/
    ├── command-registry.ts       # Command dispatcher (143 lines)
    └── commands/
        ├── index.ts              # Export all commands
        ├── agents-command.ts     # Agents subcommands (~36 lines)
        ├── config-command.ts     # Config subcommands (~58 lines)
        ├── executors-command.ts  # Executors subcommands (~60 lines)
        ├── rules-command.ts      # Rules subcommands (~55 lines)
        └── cache-command.ts      # Cache subcommands (~30 lines)
```

**Design Benefits:**
- **Separation**: Each command in its own file (~30-60 lines each)
- **Extensibility**: Add new commands without modifying main CLI
- **Type safety**: Strongly typed command/subcommand interfaces
- **Testability**: Each command can be tested independently
- **No framework**: Lightweight, zero dependencies

**Pattern:**
```typescript
// Define command
export const myCommand = createCommand({
  name: "my-command",
  description: "Does something",
  subcommands: [
    createSubcommand({
      name: "action",
      description: "Performs action",
      handler: async (args) => { /* ... */ },
    }),
  ],
});

// Register in cli.ts
const registry = new CommandRegistry();
registry.register(myCommand);
await registry.dispatch(commandName, subcommand, args);
```

**Before vs After:**
- Before: 493 lines, 4 nested switch statements
- After: ~200 lines main + ~40 lines per command module
- Result: Better maintainability, easier to extend

## Markdown Loader Architecture

The project uses a **generic markdown loader pattern** to avoid code duplication:

```
src/
├── md-loader.ts              # Generic markdown parser & loader (226 lines)
├── agents/
│   └── md-loader.ts          # Agent-specific wrapper (42 lines)
└── rules/
    └── md-loader.ts          # Rule-specific wrapper (48 lines)
```

**Design Rationale:**
- Generic `md-loader.ts` contains all parsing, file I/O, and directory scanning logic
- Type-specific wrappers (`agents/md-loader.ts`, `rules/md-loader.ts`) are thin (~40 lines each)
- Each wrapper provides:
  - `build*` function - domain-specific validation and object construction
  - Type-safe convenience functions - proper TypeScript types for Agent/Rule
- This avoids ~180 lines of duplication while maintaining type safety

**Why not inline?**
- Separation of concerns: generic parsing vs domain logic
- Type safety: Agent and Rule have different required fields
- Future extensibility: easy to add new types (e.g., Hooks, Plugins)

## Caching Strategy

Agents and rules are cached in `~/.diffray/config.json` for performance.

### Why Cache?

With recursive loading from 3 priority sources:

```
~/.diffray/agents/           # user agents
~/.diffray/rules/            # user rules
  ├── security/
  │   ├── xss.md
  │   └── sql-injection.md
  └── typescript/
      └── best-practices.md

.diffray/agents/             # project agents
.diffray/rules/              # project rules
  └── team-standards/
      └── *.md

src/defaults/agents/         # built-in agents
src/defaults/rules/          # built-in rules
```

Cold start without cache:
- ~50 files × 3 sources = 150 file reads
- Each file parsed for frontmatter
- **~100-300ms** on first run

With cache:
- 1 file read (`config.json`)
- **~5ms**

### How It Works

```typescript
// agents.ts
export async function loadAgents(): Promise<Agent[]> {
  const config = await loadConfig();

  // Cache hit: return immediately
  if (config.agents && config.agents.length > 0) {
    return config.agents;  // ~5ms
  }

  // Cache miss: load from MD files and save to cache
  await syncAgentsToConfig();  // ~100-300ms, writes to config.json
  return getAgents(await loadConfig());
}
```

### Cache Invalidation

Cache is **not** automatically invalidated when MD files change. This is intentional:
- Avoids file watching overhead
- Predictable behavior
- Explicit control

**To refresh cache:**
```bash
diffray cache sync    # Reload agents and rules from MD files
diffray cache clear   # Clear all cached data
```

### When Cache Updates

| Action | Cache Updated? |
|--------|----------------|
| First run | Yes (auto-populate) |
| `diffray cache sync` | Yes |
| `diffray cache clear` | Cleared |
| Edit MD files | No (manual sync needed) |
| Add new MD files | No (manual sync needed) |

### Trade-offs

| Approach | Pros | Cons |
|----------|------|------|
| **Disk cache (current)** | Fast startup, survives restarts | Manual sync needed |
| Memory-only cache | Always fresh | Slow cold start every time |
| File watching | Auto-refresh | Complexity, resource usage |

The disk cache approach prioritizes **startup speed** over automatic freshness.

## File Structure

```
src/
├── md-loader.ts          # Generic markdown loader
├── executors/
│   ├── base/
│   │   ├── executor.ts   # Base executor class
│   │   ├── cli.ts        # Base CLI executor
│   │   └── api.ts        # Base API executor
│   ├── cli/
│   │   ├── claude-cli.ts # Claude CLI executor
│   │   ├── auggie-cli.ts # Auggie CLI executor
│   │   └── default-cli.ts# Default CLI executor
│   ├── api/
│   │   ├── claude-api.ts # Claude API executor
│   │   ├── openai-api.ts # OpenAI API executor
│   │   └── cerebras-api.ts # Cerebras API executor
│   └── factory.ts        # Executor factory
├── agents/
│   ├── registry.ts       # Agent registry
│   ├── defaults.ts       # Default Agents
│   └── md-loader.ts      # Agent markdown loader wrapper
├── rules/
│   └── md-loader.ts      # Rule markdown loader wrapper
└── types.ts              # Type definitions
```
