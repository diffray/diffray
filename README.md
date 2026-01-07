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
- 📝 **Markdown Agents** - Define agents using simple Markdown files (inspired by Claude sub-agents)
- 🚀 **Parallel Execution** - All agents run simultaneously within their stage
- 🎨 **Live Spinners** - Visual feedback for each agent (no external dependencies)
- 🤖 **Agent System** - Define agents in markdown files with flexible configuration
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
# ⚡ diffray - AI Code Review
# 📊 Analyzing changes...
# 📝 8 files: 7 modified, 1 added
#    624 changes: +612 -12
# 🤖 Loading agents...
# ✅ Loaded 2 agent(s)
#
# 🔄 Running 2 agent(s) in parallel...
# ✅ Custom Code Review (101ms)
# ✅ Security Scanner (101ms)
#
# ✅ Pipeline completed successfully in 102ms  ⚡ 2x faster!
# 📊 2/2 agents succeeded

# Verbose mode (shows file details and prompts)
diffray --verbose

# JSON output (machine-readable)
diffray --json

# Filter by severity (show only errors)
diffray --severity=error

# Filter by multiple severities (errors and warnings)
diffray --severity=error,warning

# Combine options
diffray --json --severity=error

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

# Sync agents from MD files to cache
diffray agents sync
```

**Creating Custom Agents:**

Agents are defined using Markdown files! See [Agent Configuration Guide](./docs/AGENTS.md) for details.

To create a custom agent, create a new `.md` file in `src/defaults/agents/` with the following structure:
- Frontmatter with ID, Order, Enabled, and Executor fields
- Description section
- System Prompt section

After creating or modifying agents, run `diffray agents sync` to reload them.

### Manage Executors

```bash
# List all executors
diffray executors list

# Show executor details
diffray executors show auggie-cli

# Enable/disable executors
diffray executors enable claude-api
diffray executors disable auggie-cli
```

### Manage Rules

Rules allow you to run different agents on different file types using glob patterns. Rules are defined in YAML files in `src/defaults/rules/`.

```bash
# List all rules
diffray rules list

# Show rule details
diffray rules show typescript-review

# Test rule matching against specific files
diffray rules test typescript-review src/cli.ts src/agents.ts README.md
# Output:
# ✅ Matched 2 file(s):
#   ✅ src/cli.ts
#   ✅ src/agents.ts
# Not matched 1 file(s):
#   ❌ README.md

# Sync rules from YAML files to cache
diffray rules sync
```

**Creating Custom Rules:**

Create a new `.yaml` file in `src/defaults/rules/` with this structure:

```yaml
id: my-rule
name: My Custom Rule
description: Description of what this rule does
enabled: true
patterns:
  - "**/*.ts"
  - "**/*.tsx"
agents:
  - code-review
  - security-scan
```

**Default Rules:**
- `typescript-review`: Run code-review on `**/*.ts, **/*.tsx`
- `typescript-security`: Run security-scan on `**/*.ts, **/*.tsx`
- `config-security`: Run security-scan on config files `**/*.{json,yaml,yml,toml,env}`

### Configuration

diffray stores configuration in `~/.diffray/config.json`. This file caches agents, executors, rules, and settings.

```bash
# Initialize configuration file
diffray config init

# Show current configuration
diffray config show

# Edit configuration in your $EDITOR
diffray config edit

# Reset to defaults
diffray config reset
```

#### Configuration Structure

The configuration file has the following structure:

```json
{
  "excludePatterns": ["*.lock", "*.min.js", "dist/*", "node_modules/**"],
  "output": {
    "colorize": true,
    "verbose": false,
    "format": "terminal"
  },
  "executors": [...],
  "agents": [...],
  "rules": [...],
  "stages": [...]
}
```

**Key Sections:**

- `excludePatterns`: File patterns to exclude from review (array of glob patterns)
- `output.colorize`: Enable colored output (boolean, default: `true`)
- `output.verbose`: Show verbose output (boolean, default: `false`)
- `output.format`: Output format - `terminal`, `markdown`, or `json` (default: `terminal`)
- `executors`: Cached executor configurations (managed via `diffray executors` commands)
- `agents`: Cached agent configurations (synced from Markdown files via `diffray agents sync`)
- `rules`: Cached rule configurations (synced from YAML files via `diffray rules sync`)
- `stages`: Pipeline stage configurations with enabled/disabled status

### Executors Configuration

Executors define **how** to run Agents. diffray supports multiple executor types:

- **CLI Executors** - Run CLI tools like `auggie`, `claude`, etc.
- **LLM API Executors** - Call LLM APIs directly (Claude, GPT, etc.)

Executors are stored in `~/.diffray/executors.json`.

#### Default Executors

By default, diffray comes with:
- **default-cli** (enabled) - Stub executor for testing - prints prompt preview, waits 5s, returns empty array
- **auggie-cli** (disabled) - Uses Auggie CLI for code review
- **claude-api** (disabled) - Claude API executor
- **openai-api** (disabled) - OpenAI API executor

The **default-cli** stub executor is perfect for:
- Testing the pipeline without requiring external tools
- Understanding how executors work
- Development and debugging

To use a real executor, enable it:
```bash
diffray executors enable auggie-cli
diffray executors disable default-cli
```

#### Configuring Executors

Create or edit `~/.diffray/executors.json`:

```json
{
  "executors": [
    {
      "id": "auggie-cli",
      "name": "Auggie CLI",
      "description": "Execute via Auggie CLI agent",
      "type": "cli",
      "command": "auggie",
      "args": ["--print", "--quiet", "--model", "haiku4.5"],
      "timeout": 60,
      "enabled": true
    },
    {
      "id": "claude-api",
      "name": "Claude API",
      "description": "Execute via Anthropic Claude API",
      "type": "llm-api",
      "provider": "anthropic",
      "model": "claude-3-5-sonnet-20241022",
      "temperature": 0.7,
      "maxTokens": 4096,
      "enabled": false,
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    },
    {
      "id": "openai-api",
      "name": "OpenAI API",
      "description": "Execute via OpenAI GPT API",
      "type": "llm-api",
      "provider": "openai",
      "model": "gpt-4",
      "temperature": 0.7,
      "maxTokens": 4096,
      "enabled": false,
      "env": {
        "OPENAI_API_KEY": "sk-..."
      }
    }
  ]
}
```

#### CLI Executor Options

- `id` - Unique executor identifier
- `name` - Display name
- `description` - Description
- `type` - Must be `"cli"`
- `command` - Command to execute (e.g., `"auggie"`, `"claude"`)
- `args` - Array of command arguments
- `timeout` - Timeout in seconds (default: 60)
- `enabled` - Enable/disable executor
- `env` - Environment variables (optional)

#### LLM API Executor Options

- `id` - Unique executor identifier
- `name` - Display name
- `description` - Description
- `type` - Must be `"llm-api"`
- `provider` - API provider (`"anthropic"`, `"openai"`)
- `model` - Model name (e.g., `"claude-3-5-sonnet-20241022"`, `"gpt-4"`)
- `temperature` - Temperature (0.0-1.0)
- `maxTokens` - Maximum tokens to generate
- `enabled` - Enable/disable executor
- `env` - Environment variables with API keys

#### Example: Custom CLI Executor

```json
{
  "id": "my-custom-tool",
  "name": "My Custom Tool",
  "description": "Custom code review tool",
  "type": "cli",
  "command": "my-tool",
  "args": ["--mode", "review", "--format", "text"],
  "timeout": 30,
  "enabled": true
}
```

#### Linking Agents to Executors

Agents reference executors via the `executor` field in their configuration. Agents are defined in Markdown files (see [Agent Configuration Guide](./docs/AGENTS.md)) or stored in `~/.diffray/config.json`:

```json
{
  "agents": [
    {
      "id": "code-review",
      "name": "Code Review",
      "executor": "auggie-cli",
      "enabled": true
    }
  ]
}
```

To use a different executor, change the `executor` field:

```json
{
  "executor": "claude-api"  // Use Claude API instead
}
```

## Agent Configuration

Agents are configured using **Markdown files** in `src/defaults/agents/`. See the [Agent Configuration Guide](./docs/AGENTS.md) for complete documentation.

### Agent Markdown Format

Each agent is defined in a `.md` file with frontmatter metadata:

```markdown
# Agent: Code Review

---
ID: code-review
Order: 1
Enabled: true
Executor: claude-api
---

## Description

Performs comprehensive code reviews to identify bugs and improvements.

## System Prompt

You are a code reviewer analyzing changes for:

### Logic Errors
- Identify bugs and edge cases
- Check error handling

### Code Quality
- Assess readability
- Check naming conventions

Reference ../output-format.md for JSON output structure.
```

The system will automatically load all `.md` files from `src/defaults/agents/` and cache them in the config. Run `diffray agents sync` to reload after changes.

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
│   ├── agents/              # Agent registry and loaders
│   ├── executors/           # Executor implementations
│   ├── commands/            # CLI commands
│   ├── defaults/            # Default agents and rules (MD/YAML)
│   ├── git.ts               # Git operations
│   └── issue-formatter.ts   # Issue formatting
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
