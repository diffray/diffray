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
- Loaded directly from MD files on each run via `src/agents/md-loader.ts`
- Sources (priority order): project `.diffray/agents/`, user `~/.diffray/agents/`, defaults

**Executors** (`src/executors.ts`):
- Types: `llm-api` (HTTP API), `cli` (subprocess)
- Factory pattern: `executorFactory.executeAgent(context)`
- Built-in executors:
  - `cerebras-api` - Cerebras AI API (requires `CEREBRAS_API_KEY`)
  - `claude-cli` - Claude Code CLI with streaming support
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
- `src/defaults/prompts/output-format.md` - JSON format agents must return

## CLI Subcommands
- `diffray review` - Execute code review pipeline
  - `--base <ref>` - Base commit/branch (e.g., `main`, `HEAD~3`)
  - `--head <ref>` - Head commit/branch (default: `HEAD`)
    - When `--base` specified with no uncommitted changes, temporarily checks out `--head` ref for CLI tools, then restores original branch
  - `--severity <list>` - Filter by severity (comma-separated: critical,high,medium,low)
  - `--json` - Output results in JSON format
  - `--stream` - Show streaming (💭 thinking, 🔧 tools, ⚠ preliminary issues)
  - `--verbose` - Show raw JSON stream
  - `--skip-validation` - Skip validation stage
  - Without `--base`: reviews uncommitted changes, or last commit if clean
- `diffray agents list/show` - View agents
- `diffray rules list/show/test` - View and test rules
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
- Config stored at `~/.diffray/config.json` (executors, stages, validation settings only)
- Agents and rules are always loaded fresh from MD files (no caching)
- Agents reference prompts via `../prompts/output-format.md` in their systemPrompt
