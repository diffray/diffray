# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands
- `bun run dev` - Run CLI in development mode
- `bun test` - Run all tests
- `bun test <filename>` - Run specific test file (e.g., `bun test md-loader`)
- `bun build` - Build standalone binary to `dist/diffray`
- `bun run ts-check` - TypeScript type checking
- `bun link` - Link globally for testing
- `bun run lint` - ESLint
- `bun run lint:fix` - Fix lint issues
- `bun run format` - Format with Prettier

## Architecture Overview

### Pipeline Flow
```
Git Diffs → Pipeline → Stages → Issues

Stages (sequential):
  1. load-rules     - Load rules from MD files, resolve agents
  2. match-rules    - Match files to rules using glob patterns
  3. execute-agents - Run agents in parallel via executors
  4. aggregate      - Collect results from all agents
  5. deduplication  - Remove duplicate issues
  6. validation     - LLM validates issues, filters false positives
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
- Loaded via `src/agents/md-loader.ts`
- Cached in config, sync with `diffray agents sync`

**Executors** (`src/executors.ts`):
- Types: `llm-api` (HTTP API), `cli` (subprocess)
- Factory pattern: `executorFactory.executeAgent(context)`
- Built-in executors:
  - `cerebras-api` - Cerebras AI API (requires `CEREBRAS_API_KEY`)
  - `claude-cli` - Claude Code CLI with streaming support
  - `test-cli` - Stub for testing

**Claude CLI Executor**:
- Uses `claude -p --output-format stream-json --verbose` for streaming
- Shows reasoning with `💭` prefix (unless `--quiet`)
- In `--verbose` mode shows additional JSON:
  - `📋` - System init (tools, session, model)
  - `🔧` - Tool use messages
  - `📊` - Result metadata (cost, usage, duration)
- Default model: `sonnet`, timeout: 120s
- Can use Read/Grep tools to gather context before answering

**Rules** (`src/defaults/rules/*.md`):
- Map glob patterns to agents
- Contain additional prompts for matched files
- Loaded via `src/md-loader.ts`

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
- `src/defaults/prompts/output-format.md` - JSON format agents must return

## CLI Subcommands
- `diffray review` - Execute code review pipeline
  - `--base <ref>` - Base commit/branch (e.g., `main`, `HEAD~3`)
  - `--head <ref>` - Head commit/branch (default: `HEAD`)
    - When `--base` specified with no uncommitted changes, temporarily checks out `--head` ref for CLI tools, then restores original branch
  - `--severity <list>` - Filter by severity (comma-separated: critical,high,medium,low)
  - `--json` - Output results in JSON format (quiet mode, no streaming)
  - `--verbose` - Show raw JSON stream (📋 system, 🔧 tools, 📊 results)
  - `--quiet` - Hide streaming output (💭 reasoning)
  - `--skip-validation` - Skip validation stage
  - Without `--base`: reviews uncommitted changes, or last commit if clean
- `diffray agents sync` - Reload agents from MD files
- `diffray rules sync` - Reload rules from MD files
- `diffray executors list/enable/disable` - Manage executors

## Technology
- Runtime: Bun
- CLI Framework: citty
- Type Safety: TypeScript (strict mode, bundler resolution)
- Validation: Zod schemas
- Git Operations: isomorphic-git (`src/git.ts`)

## Development Notes
- ES Modules with bundler moduleResolution (no `.js` extensions needed)
- Markdown frontmatter parsed with custom regex (see `md-loader.ts`)
- Config stored at `~/.diffray/config.json`
- Agents reference prompts via `../prompts/output-format.md` in their systemPrompt
