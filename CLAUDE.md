# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Why diffray?

**Why not just prompts, commands, or skills in Claude Code?**

diffray exists because we believe code review should be **systematic, not ad-hoc**:

- **Distributable rules** — Create, share, and evolve review rules across teams and projects. Rules live in `.diffray/` directories and can be versioned, inherited, and overridden.

- **Flexible configuration** — Fine-tune agents, models, timeouts, and concurrency per project. Disable security checks for a prototype, use Opus for validation, run 6 agents in parallel — all configurable.

- **LLM independence** — Not locked to Claude Code. Use `claude-cli`, `cursor-agent-cli`, Cerebras API, or add your own executor. Switch models per stage (Haiku for fast passes, Opus for validation).

- **Clean context** — Each agent runs in isolation with only relevant diffs and rules. No conversation history pollution, no context window bloat. Parallel execution with fresh context per agent.

- **Performance** — Run multiple specialized agents concurrently. Batch validation. Stream results. Process large PRs that would overwhelm a single LLM session.

- **Reproducibility** — Same rules + same diffs = consistent reviews. No dependency on conversation state or prompt engineering skills.

## Common Commands
- `npm run dev` - Run CLI in development mode
- `npm test` - Run all tests
- `npm test -- md-loader` - Run specific test file
- `npm run build` - Build to `dist/diffray.cjs`
- `npm run ts-check` - TypeScript type checking
- `npm link` - Link globally for testing
- `npm run lint` - ESLint
- `npm run lint:fix` - Fix lint issues
- `npm run format` - Format with Prettier

## Architecture Overview

### Pipeline Flow
```
Git Diffs → Pipeline → Stages → Issues

Stages (sequential):
  1. load-rules        - Load rules from MD files, resolve agents
  2. match-rules       - Match files to rules using glob patterns
  3. review            - Run agents in parallel via executors
  4. aggregate-results - Collect results from all agents
  5. deduplication     - Remove duplicate issues
  6. validation        - LLM validates issues, filters false positives
```

### Core Components

**Entry Point**: `bin/diffray.ts` → `src/cli.ts` (citty CLI framework)

**Pipeline** (`src/pipeline.ts`):
- Orchestrates stages sequentially
- Manages `PipelineContext` passed between stages
- Registers agents and executors

**Stages** (`src/stages/`):
- Each stage implements `Stage` interface with `execute(context)` method
- Stages mutate `PipelineContext` (add matchedRules, results, issues)

**Agents** (`src/defaults/agents/*.md`):
- Defined in Markdown with YAML frontmatter (ID, Order, Enabled, Executor)
- Loaded directly from MD files on each run via `src/agents/md-loader.ts`
- Sources (priority order): project `.diffray/agents/`, user `~/.diffray/agents/`, defaults
- Built-in agents:
  - `general` - General code reviewer focused on simplicity and clarity
  - `bug-hunter` - Detects bugs, logic errors and runtime issues
  - `security-scan` - Scans for security vulnerabilities
  - `performance-check` - Checks for performance issues
  - `consistency-check` - Detects inconsistencies in code style, patterns, and conventions
  - `validation` - Validates issues found by other agents (internal)

**Executors** (`src/executors/`):
- Types: `llm-api` (HTTP API), `cli` (subprocess), `mcp` (MCP protocol)
- Modular structure: `api.ts`, `cli.ts`, `claude-cli.ts`, `cursor-agent-cli.ts`, `process.ts`, `types.ts`, `utils.ts`
- Built-in executors:
  - `cerebras-api` - Cerebras AI API (requires `CEREBRAS_API_KEY`)
  - `claude-cli` - Claude Code CLI with streaming support
  - `cursor-agent-cli` - Cursor Agent CLI
  - `test-cli` - Stub for testing

**Claude CLI Executor**:
- Uses `claude -p --output-format stream-json --verbose` for streaming
- Default: quiet (no streaming output)
- With `--stream` shows:
  - `📋` - Session info (model, tools)
  - `🔧` - Tool use (Read, Grep, etc.)
  - `💭` - Thinking (truncated to 200 chars)
  - `📊` - Cost/duration
  - `⚠ Preliminary issues` - Formatted before validation
- With `--verbose`: raw JSON stream
- Default model: `sonnet`, timeout: 120s

**Rules** (`src/defaults/rules/*.md`):
- Map glob patterns to agents
- Contain additional prompts for matched files
- Loaded directly from MD files on each run via `src/md-loader.ts`
- Sources (priority order): project `.diffray/rules/`, user `~/.diffray/rules/`, defaults

### Data Flow
```
GitDiff[] → MatchedRule[] → AgentResult[] → Issue[]
              (files +        (raw output)    (parsed,
               agent +                         validated)
               prompt)
```

### Issue Structure
```typescript
interface Issue {
  file: string;
  lineStart: number;
  lineEnd: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'security' | 'performance' | 'bug' | 'quality' | 'style' | 'docs';
  shortDescription: string;
  fullDescription: string;
  suggestion?: string;
  agent: string;
}
```

## Key Files
- `src/types.ts` - All TypeScript interfaces
- `src/config.ts` - Config schema (Zod), load/save to `~/.diffray/config.json`
- `src/issue-parser.ts` - Parse JSON issues from agent output
- `src/issue-formatter.ts` - Format issues for terminal/JSON output
- `src/concurrency.ts` - p-limit style concurrency limiter
- `src/batch-executor.ts` - Batch execution with spinner feedback
- `src/defaults/prompts/output-format.md` - JSON format agents must return

## CLI Subcommands
- `diffray review` - Execute code review pipeline
  - `--base <ref>` - Base commit/branch (e.g., `main`, `HEAD~3`)
  - `--head <ref>` - Head commit/branch (default: `HEAD`)
    - When `--base` specified with no uncommitted changes, temporarily checks out `--head` ref for CLI tools, then restores original branch
  - `--agent <list>` - Run only specific agents (comma-separated: `bug-hunter,general`)
  - `--exclude-agent <list>` - Exclude specific agents (comma-separated)
  - `--rule <list>` - Run only specific rules (comma-separated: `code-security,code-bugs`)
  - `--exclude-rule <list>` - Exclude specific rules (comma-separated)
  - `--severity <list>` - Filter by severity (comma-separated: critical,high,medium,low)
  - `--json` - Output results in JSON format
  - `--stream` - Show streaming (💭 thinking, 🔧 tools, ⚠ preliminary issues)
  - `--verbose` - Show raw JSON stream
  - `--skip-validation` - Skip validation stage
  - Without `--base`: reviews uncommitted changes, or last commit if clean
- `diffray agents` - List agents, `diffray agents <name>` - Show agent details
- `diffray rules` - List rules, `diffray rules <name>` - Show rule details
- `diffray executors` - Show current executor and stage settings
- `diffray executors <name>` - Show executor details (command, model, timeout)
- `diffray config show` - Show merged configuration
- `diffray config init` - Initialize project config (.diffray.json)
- `diffray config edit [--global]` - Edit config in $EDITOR

## Technology
- Runtime: Node.js 18+ (uses native ES modules)
- CLI Framework: citty
- Type Safety: TypeScript (strict mode, bundler resolution)
- Build: esbuild (via `build.mjs`)
- Testing: Vitest
- Validation: Zod schemas
- Git Operations: diff library + native git commands (`src/git.ts`)

## Configuration

Configuration uses two levels with priority merge:
- **Global**: `~/.diffray/config.json` - user-wide settings
- **Project**: `.diffray.json` - project-specific overrides

Priority: defaults < global < project

**Config commands:**
```bash
diffray config show              # Show merged config
diffray config init              # Create .diffray.json in project
diffray config edit              # Edit project config in $EDITOR
diffray config edit --global     # Edit global config
```

**Example global config** (`~/.diffray/config.json`):
```json
{
  "executor": "claude-cli",
  "concurrency": 6,
  "executors": {
    "claude-cli": {
      "review": { "model": "sonnet", "concurrency": 6 },
      "validation": { "model": "opus", "timeout": 180, "batchSize": 10, "concurrency": 3 }
    }
  },
  "agents": {},
  "rules": {},
  "output": { "colorize": true, "verbose": false, "format": "terminal" }
}
```

**Example project config** (`.diffray.json`):
```json
{
  "agents": {
    "security-scan": { "enabled": false },
    "bug-hunter": { "model": "haiku" }
  },
  "rules": {
    "code-security": { "enabled": false }
  }
}
```

**Agent overrides** (`config.agents.<name>`):
- `enabled` - Enable/disable agent (boolean)
- `model` - Override model for agent
- `timeout` - Override timeout for agent

**Rule overrides** (`config.rules.<name>`):
- `enabled` - Enable/disable rule (boolean)
- `agent` - Override agent for rule

**Stage settings** (`executors.<executor>.<stage>`):
- `model` - Model to use for this stage
- `timeout` - Timeout in seconds
- `concurrency` - Parallel executions (1-10)
- `batchSize` - Items per batch (validation only, 1-50)

**Key settings:**
- `executor` - Active executor (`claude-cli`, `cursor-agent-cli`)
- `concurrency` - Default parallel agents (1-10)
- `executors.<name>.<stage>` - Per-executor stage settings
- `agents.<name>` - Agent overrides
- `rules.<name>` - Rule overrides

## Development Notes
- ES Modules with bundler moduleResolution (no `.js` extensions needed)
- Markdown frontmatter parsed with custom regex (see `md-loader.ts`)
- Global instructions can be added at `~/.diffray/instructions.md`
- Agents and rules are always loaded fresh from MD files (no caching)
- Agents reference prompts via `../prompts/output-format.md` in their systemPrompt
