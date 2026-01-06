# ⚡ diffray

**Code Review Pipeline** - Git diffs → Agents → Results

## What is an Agent?

**Agent is an abstraction** - it can be either:

- 🤖 **LLM Agent** - API call to Claude, GPT, or other LLMs
- 🛠️ **CLI Agent** - Execution of CLI tools like `claude`, `auggie`, etc.

This allows you to combine different review approaches in one pipeline!


## Architecture

```
Git Changes → Pipeline → LLM Agent (Claude API)  → Result 1
                      → CLI Agent (claude code) → Result 2
                      → CLI Agent (auggie)      → Result 3
                      → LLM Agent (GPT-4)       → Result 4
```

## Key Features

- ⚡ **Pipeline-based** - Process diffs through multiple stages
- 📋 **Stage System** - Organized execution: Load Rules → Match → Execute → Aggregate
- 🎯 **Rule Matching** - Run different agents on different file types using glob patterns
- 🔀 **Flexible Agents** - Mix LLM APIs and CLI tools in one pipeline
- 🚀 **Parallel Execution** - All agents run simultaneously within their stage
- 🎨 **Live Spinners** - Visual feedback for each agent (no external dependencies)
- 🤖 **Agent System** - Load agents from backend or use defaults
- 🔄 **Configurable** - Enable/disable agents, rules, and stages
- 🎯 **Simple** - One command to run entire pipeline
- 🌍 **Global** - Works in any git repository
- 📝 **Centralized Logging** - Fast, simple logger using Bun's console
- 🪶 **Lightweight** - Only 1 dependency (zod for config validation)

## Installation

### From source

```bash
# Clone and install
git clone <your-repo>
cd diffray
bun install

# Link globally
bun link
```

Now you can use `diffray` anywhere!

## Usage

### Run Pipeline

```bash
# Run code review pipeline
diffray

# Output:
# ⚡ diffray - AI Code Review Pipeline
# 📊 Analyzing changes...
# 📝 8 files: 7 modified, 1 added
#    624 changes: +612 -12
# 🤖 Loading agents...
# ✅ Loaded 2 agent(s)
#
# 🔄 Running 2 agent(s) in parallel...
# ✅ Custom Code Review (101ms)
# ✅ Backend Security Check (101ms)
#
# ✅ Pipeline completed successfully in 102ms  ⚡ 2x faster!
# 📊 2/2 agents succeeded

# Verbose mode (shows file details)
VERBOSE=1 diffray

# Output includes:
#    📝 README.md: +141 -5
#    📝 src/cli.ts: +107 -3
#    ➕ src/config.test.ts: +52 -0
#    ...
```

### Manage Agents

```bash
# List all agents
diffray agents list

# Show agent details
diffray agents show code-review

# Enable/disable agents
diffray agents enable performance-check
diffray agents disable security-scan

# Change execution order
diffray agents order code-review 1

# Sync agents from backend
diffray agents sync
```

### Manage Rules

Rules allow you to run different agents on different file types using glob patterns.

```bash
# List all rules
diffray rules list

# Show rule details
diffray rules show typescript-files

# Add new rule
diffray rules add ts-files "TypeScript Files" "**/*.ts" code-review security-scan

# Remove rule
diffray rules remove ts-files

# Enable/disable rule
diffray rules enable ts-files
diffray rules disable ts-files

# Update rule pattern
diffray rules pattern ts-files "src/**/*.ts"

# Update rule agents
diffray rules agents ts-files code-review performance-check

# Test rule matching
diffray rules test ts-files src/cli.ts src/agents.ts README.md
# Output:
# ✅ Matched 2 file(s):
#   ✅ src/cli.ts
#   ✅ src/agents.ts
# Not matched 1 file(s):
#   ❌ README.md
```

**Default Rules:**
- `typescript-files`: Run code-review and security-scan on `**/*.ts`
- `test-files`: Run code-review on `**/*.test.ts`
- `config-files`: Run security-scan on `**/*.{json,yaml,yml,toml}`

### MCP Servers

diffray supports [Model Context Protocol (MCP)](https://modelcontextprotocol.io) servers for enhanced context.

**Centralized Configuration**: MCP servers are stored in `~/.mcp/config.json` and shared across all tools (diffray, claude code, auggie, etc.)

```bash
# List all MCP servers
diffray mcp list

# Add MCP server
diffray mcp add filesystem npx -y @modelcontextprotocol/server-filesystem /path/to/dir
diffray mcp add github npx -y @modelcontextprotocol/server-github
diffray mcp add postgres npx -y @modelcontextprotocol/server-postgres

# Show server details
diffray mcp show filesystem

# Enable/disable servers
diffray mcp enable filesystem
diffray mcp disable github

# Set environment variables
diffray mcp env github GITHUB_TOKEN ghp_xxxxx
diffray mcp env postgres DATABASE_URL postgresql://...

# Remove server
diffray mcp remove filesystem
```

### Configuration

diffray stores configuration in `~/.diffray/config.json` and agents in `~/.diffray/agents.json`.

```bash
# Initialize configuration file
diffray config init

# Show current configuration
diffray config show

# Set a configuration value
diffray config set ai.provider anthropic
diffray config set review.autoReview true

# Get a configuration value
diffray config get ai.provider

# Edit configuration in your $EDITOR
diffray config edit

# Reset to defaults
diffray config reset
```

#### Configuration Options

**Backend Settings** (`backend.*`):
- `url`: Backend API URL for loading agents
- `apiKey`: API key for backend authentication
- `enabled`: Enable backend integration (default: `false`)

**AI Settings** (`ai.*`):
- `provider`: AI provider to use (`openai`, `anthropic`, `local`, `none`)
- `apiKey`: API key for the provider
- `model`: Model to use (e.g., `gpt-4`, `claude-3-opus`)
- `baseUrl`: Custom API base URL

**Review Settings** (`review.*`):
- `autoReview`: Automatically run AI review (default: `false`)
- `includeTests`: Include test files in review (default: `true`)
- `maxFilesPerReview`: Maximum files per review (default: `10`)
- `excludePatterns`: File patterns to exclude (default: `["*.lock", "*.min.js", "dist/*"]`)

**Output Settings** (`output.*`):
- `colorize`: Use colors in output (default: `true`)
- `verbose`: Show verbose output (default: `false`)
- `format`: Output format (`terminal`, `markdown`, `json`)

**MCP Settings** (stored in `~/.mcp/config.json`):

MCP configuration is **centralized** and shared across all tools. Use `diffray mcp` commands to manage servers.

Example MCP configuration in `~/.mcp/config.json`:
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      "disabled": false
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxx"
      },
      "disabled": false
    }
  }
}
```

## Agent Types

### LLM Agent Example

```json
{
  "id": "claude-review",
  "name": "Claude Code Review",
  "description": "Review using Claude API",
  "type": "llm",
  "prompt": "Review this code for bugs and improvements",
  "model": "claude-3-5-sonnet",
  "provider": "anthropic",
  "enabled": true,
  "order": 1
}
```

### CLI Agent Examples

**Using claude code:**
```json
{
  "id": "claude-cli",
  "name": "Claude CLI Review",
  "description": "Review using claude code CLI",
  "type": "cli",
  "command": "claude",
  "args": ["code", "review"],
  "prompt": "Review for bugs and security issues",
  "enabled": true,
  "order": 2
}
```

**Using auggie:**
```json
{
  "id": "auggie-review",
  "name": "Auggie Review",
  "description": "Review using auggie CLI",
  "type": "cli",
  "command": "auggie",
  "args": ["review"],
  "prompt": "Analyze and suggest improvements",
  "enabled": true,
  "order": 3
}
```

**Custom CLI tool:**
```json
{
  "id": "custom-linter",
  "name": "Custom Linter",
  "description": "Run custom linting tool",
  "type": "cli",
  "command": "my-linter",
  "args": ["--strict", "--format=json"],
  "enabled": true,
  "order": 4
}
```

## Example Output

```
🔍 diffray - AI-powered code review

📊 Analyzing changes...

Summary: 📝 2 modified, ➕ 1 added

================================================================================

📝 src/index.ts (modified)

+ export function greet(name: string): string {
+   return `Hello, ${name}!`;
+ }

--------------------------------------------------------------------------------

✨ Reviewed 3 file(s)
```

## Development

```bash
# Run in development mode
bun run dev

# Build standalone binary
bun run build

# Run tests
bun test
```

## Project Structure

```
diffray/
├── bin/
│   └── diffray.ts           # CLI entry point
├── src/
│   ├── cli.ts               # Main CLI logic
│   ├── pipeline.ts          # Pipeline execution
│   ├── stages/              # Pipeline stages
│   ├── subagents/           # SubAgent definitions
│   ├── executors/           # Executor implementations
│   ├── commands/            # CLI commands
│   ├── git.ts               # Git operations
│   ├── issue-formatter.ts   # Issue formatting
│   └── token-counter.ts     # Token counting
└── package.json
```

## Roadmap

- [ ] AI-powered code review suggestions
- [ ] Support for multiple AI providers (OpenAI, Anthropic, etc.)
- [ ] Interactive mode with file selection
- [ ] Export reports to markdown/HTML
- [ ] Custom review rules and configurations
- [ ] Integration with GitHub/GitLab

## Built With

- [Bun](https://bun.sh) - Fast JavaScript runtime
- TypeScript - Type safety
- Git - Version control integration

## License

MIT
