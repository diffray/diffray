# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.2] - 2026-01-13

### Added

- **OpenCode CLI executor** — New executor for OpenCode AI CLI
  - `diffray review --executor opencode-cli` — Use OpenCode as executor
  - Supports all OpenCode models (e.g., `opencode/gpt-5-nano`, `opencode/grok-code`)
  - Streaming support with `--stream` flag
  - Installation: `curl https://opencode.ai/install -fsS | bash`

- **`--model` flag** — Override model for all agents from CLI
  - `diffray review --model sonnet` — Use Sonnet for all agents
  - `diffray review --model opus` — Use Opus for thorough review
  - `diffray review --executor opencode-cli --model opencode/gpt-5-nano` — Combine executor and model
  - Overrides both agent settings and config file settings (highest priority)

- **Model override documentation** — Comprehensive guide in README
  - Available models per executor
  - Override hierarchy (CLI > project config > global config > defaults)
  - Configuration examples for global and project configs
  - Practical use cases and recommendations
  - Performance vs quality trade-offs table

### Changed

- **Improved setup-command** — Better multi-file support
  - Now installs multiple command files per CLI tool
  - Cleaner status display with per-command file status
  - Better removal message ("command file(s)" vs "installation(s)")

- **Simplified model override logic** — Cleaner code in `executeAgent()`
  - Removed unnecessary wrapper object in model override path
  - Direct executor call with overridden settings
  - Same behavior, less complexity

### Fixed

- Optional chaining for `config.executors` access in validation stage

## [0.5.1] - 2026-01-13

### Added

- **`diffray setup-command` command** — Install `/diffray` command for Claude Code, Cursor Agent, and OpenCode
  - `diffray setup-command` — Install command to all detected CLI tools
  - `diffray setup-command --force` — Overwrite existing installation
  - `diffray setup-command status` — Show installation status for all tools
  - `diffray setup-command remove` — Remove command from all tools
  - Command enables `/diffray` slash command in editors with interactive review mode

## [0.5.0] - 2026-01-13

### Added

- **`--files` flag** — Review only specific files (comma-separated paths)
  - `diffray review --files src/auth.ts` — review changes in single file
  - `diffray review --files src/a.ts,src/b.ts` — review multiple files
  - `diffray review --files src/auth.ts --base main` — changes relative to main

- **`--full` flag** — Review entire file content without git diff
  - `diffray review --files src/auth.ts --full` — review whole file
  - Requires `--files` flag, incompatible with `--base`

### Changed

- Refactored `runReview()` with helper functions for better maintainability
  - `tryCheckoutToHead()` — checkout logic
  - `getDefaultDiffs()` — uncommitted/last commit diffs
  - `collectDiffs()` — all diff collection modes
  - `formatResults()` — result formatting and output

### Fixed

- Duplicate `successCount` calculation in `formatResults()`

## [0.4.0] - 2026-01-12

### Added

- **Confidence filtering stage** - Filter issues by confidence threshold before validation
  - New `--confidence <0-100>` CLI option (default: 80)
  - Separate stage `confidence-filter` runs after review, before validation
  - Issues below threshold are filtered out early to reduce validation cost

- **CLI schema validation** - Zod-based input validation for all CLI arguments
  - Type-safe parsing in `src/cli-schema.ts`
  - Comprehensive test coverage in `src/cli-schema.test.ts`
  - Validates numeric ranges, comma-separated lists, and option combinations

- **Evidence field in issues** - Agents can now provide concrete code proof
  - New optional `evidence` field in Issue type
  - Shows exact code snippet that demonstrates the issue
  - Displayed in formatted output with syntax highlighting

- **Validation instructions split** - Optimized prompt structure for better caching
  - System prompt: Core principles only (57 lines, ~1.3KB)
  - User prompt: Detailed instructions from `validation-instructions.md`
  - Reduces API costs via prompt caching

- **Validation rule** - Example rule at `.diffray/rules/validation.md`
  - Documents validation stage behavior
  - Provides guidance for custom validation agents

### Changed

- **Validation stage improvements** - Better context awareness for intentional design decisions
  - Validation instructions now explicitly check code comments and inline documentation
  - Added guidance to check CLAUDE.md and README.md for architectural decisions
  - Repository context now mentions project documentation files
  - Validation agent prompted to verify comments explaining trade-offs before flagging issues

- **Validation stage refactored** - Parser chain pattern for output formats
  - Split `parseValidatedIds` into 4 separate parsers with clear responsibilities
  - Improved testability and maintainability
  - Better error handling with explicit format fallbacks

- **Validation agent simplified** - Moved detailed instructions to separate file
  - Agent file now focuses on core principles
  - Detailed instructions in `defaults/prompts/validation-instructions.md`
  - More efficient prompt caching

- **Issue parser enhanced** - Support for evidence field and confidence
  - Parses new `evidence` field from agent output
  - Handles missing confidence gracefully (defaults to 100)
  - Better error messages for malformed JSON

- **Output format updated** - Agents must now provide evidence when possible
  - Updated `defaults/prompts/output-format.md` with evidence examples
  - Guidance on when to include concrete code proof

### Fixed

- Deduplication now preserves evidence field from issues
- Rule badge display for validation rules in `diffray rules` command

## [0.3.2] - 2026-01-12

### Added

- `diffray extends install <url>` now auto-adds URL to config
- `--global` flag to add extends to global config (`~/.diffray/config.json`)

## [0.3.1] - 2026-01-12

### Added

- **Extends system** - Load agents and rules from any git repository
  - Configure in `.diffray.json`: `"extends": ["https://github.com/owner/repo#v1.0"]`
  - Supports HTTPS and SSH URLs with optional ref (branch/tag)
  - Commands: `diffray extends install`, `diffray extends list`, `diffray extends remove`
  - Lockfile tracking at `~/.diffray/extends.lock.json`

- **`--branch` CLI option** - Review branches against auto-detected base
  - `diffray review --branch .` - Current branch vs main (auto-detect)
  - `diffray review --branch feature-auth` - Specific branch vs main
  - `diffray review --branch . --base develop` - Override base branch
  - Auto-detects default branch from remote origin or falls back to main/master/develop

### Changed

- Parallel processing for extends installation (4 concurrent clones)

### Security

- Path traversal protection in `removeExtend()` - validates paths before deletion

## [0.2.0] - 2025-01-10

### Added
- **Cursor Agent CLI executor** - full streaming support for Cursor Agent CLI
- **Consistency-check agent** - detects inconsistencies in code style, patterns, and conventions
- **CONTRIBUTING.md** - comprehensive contribution guidelines
- **Husky + lint-staged** - pre-commit hooks for code quality (ESLint, Prettier)
- **Centralized path management** (`src/paths.ts`) - unified resolution for agents, rules, and configs
- **Project config** (`.diffray.json`) - example project-level configuration

### Changed
- Major documentation overhaul - expanded README, ARCHITECTURE, CLAUDE.md
- Improved config system with better defaults and validation
- Updated agent prompts for better accuracy
- Refactored executor system for cleaner code organization
- Enhanced CLI with better error messages and help text

### Fixed
- Config loading edge cases
- Rule matching with nested directories
- Agent loading from multiple sources

## [0.1.3] - 2025-01-09

### Added
- MultiProgress display for parallel agent execution - visual feedback when multiple agents run concurrently

### Fixed
- Exclude binaries from npm package - smaller package size

## [0.1.2] - 2025-01-08

### Added
- Embedded defaults support - agents and rules are bundled with the package
- Streaming output with `--stream` flag - see thinking, tool use, and preliminary issues in real-time
- Claude CLI streaming with `--verbose` flag for raw JSON output
- Batch processing for validation stage - process multiple issues in parallel
- Cerebras API executor - alternative to Claude CLI using Cerebras API
- Unified caching system for better performance
- `executorSettings` override in agent frontmatter

### Changed
- Simplified build process with esbuild
- Modularized executor system - cleaner separation between CLI, API, and MCP executors
- Reorganized agents/rules structure for better maintainability
- Enhanced deduplication and validation stages

### Fixed
- Validation timeout and fuzzy matching for `<json>` format
- Issue parsing edge cases

## [0.1.1] - 2025-01-07

### Added
- Initial public release
- Core pipeline: load-rules → match-rules → review → deduplicate → validate
- Built-in agents: general, bug-hunter, security-scan, performance-check, consistency-check
- Claude CLI executor with streaming support
- Cursor Agent CLI executor
- Configuration system with global and project-level settings
- Custom agents and rules via Markdown files

### Changed
- Major codebase cleanup and modernization

[0.5.2]: https://github.com/diffray/diffray/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/diffray/diffray/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/diffray/diffray/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/diffray/diffray/compare/v0.3.2...v0.4.0
[0.3.2]: https://github.com/diffray/diffray/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/diffray/diffray/compare/v0.2.0...v0.3.1
[0.2.0]: https://github.com/diffray/diffray/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/diffray/diffray/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/diffray/diffray/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/diffray/diffray/releases/tag/v0.1.1
