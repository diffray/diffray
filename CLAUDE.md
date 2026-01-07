# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands
- `bun run dev` - Run CLI in development mode
- `bun test` - Run all tests
- `bun test <filename>` - Run specific test file
- `bun build` - Build standalone binary to `dist/diffray`
- `bun run ts-check` - TypeScript type checking
- `bun link` - Link globally for testing
- `bun run lint` - ESLint
- `bun run lint:fix` - Fix lint issues
- `bun run format` - Format with Prettier

## Architecture Overview
The project is a pipeline-based code review system:
1. **Entry Point**: `bin/diffray.ts` → `src/cli.ts` using citty CLI framework
2. **Pipeline**: `src/pipeline.ts` - Orchestrates stages with agents and executors
3. **Stages** (in `src/stages/`): Sequential pipeline phases
   - load-rules → match-rules → execute-agents → aggregate-results → deduplication → validation
4. **Agents**: Code review specialists defined in Markdown files (`src/defaults/agents/*.md`)
5. **Executors**: How agents run - LLM APIs (Cerebras) or CLI tools (claude-cli)
6. **Rules**: Match files to agents using glob patterns (`src/defaults/rules/*.md`)

## Key Types (src/types.ts)
- `GitDiff` - File change with diff content
- `Agent` - Review agent with systemPrompt and executor reference
- `AgentExecutor` - Execution backend (LLM API, CLI, or MCP)
- `Rule` - Maps glob patterns to agents
- `Stage` - Pipeline phase with execute function
- `Issue` - Code issue with severity, file, line range, description

## Configuration
- Config stored at `~/.diffray/config.json`
- Managed via `diffray config` commands
- Agents/rules cached from MD files via `diffray agents sync` / `diffray rules sync`
- Schema validation with Zod (`src/config.ts`)

## CLI Subcommands
- `diffray review` - Execute code review pipeline
  - `--base <ref>` - Base commit/branch to compare from (e.g., `main`, `HEAD~3`)
  - `--head <ref>` - Head commit/branch to compare to (default: `HEAD`)
  - `--severity <list>` - Filter by severity (comma-separated: error,warning,info,suggestion)
  - `--json` - Output results in JSON format
  - `--verbose` - Show detailed output
  - `--skip-validation` - Skip validation stage (show all issues without LLM filtering)
  - Without `--base`: reviews uncommitted changes, or last commit if working tree is clean
- `diffray config` - Manage configuration
- `diffray agents` - List/show/sync agents
- `diffray executors` - Manage executors
- `diffray rules` - Manage file-to-agent rules
- `diffray cache` - Cache management

## Technology
- Runtime: Bun
- CLI Framework: citty
- Type Safety: TypeScript (strict mode, bundler resolution)
- Validation: Zod schemas
- Git Operations: isomorphic-git (`src/git.ts`)

## Development Patterns
- ES Modules with bundler moduleResolution
- No `.js` extensions needed in imports (bundler mode)
- Markdown-based configuration for agents and rules
- Simplified executor system (`src/executors.ts`)
- Registry pattern for agents (`src/agents/registry.ts`)