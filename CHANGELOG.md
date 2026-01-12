# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/diffray/diffray/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/diffray/diffray/compare/v0.2.0...v0.3.1
[0.2.0]: https://github.com/diffray/diffray/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/diffray/diffray/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/diffray/diffray/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/diffray/diffray/releases/tag/v0.1.1
