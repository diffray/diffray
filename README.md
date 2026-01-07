# ⚡ diffray

**Code Review Pipeline** - Git diffs → Agents → Results

## What is an Agent?

**Agent is an abstraction** - it can be either:

- **LLM Agent** - API call to Claude, GPT, or other LLMs
- **CLI Agent** - Execution of CLI tools like `claude`, `auggie`, etc.

This allows you to combine different review approaches in one pipeline!


## Architecture

```
Git Changes → Pipeline → LLM Agent (Claude API)  → Result 1
                      → CLI Agent (claude code) → Result 2
                      → CLI Agent (auggie)      → Result 3
                      → LLM Agent (GPT-4)       → Result 4
```

## Key Features

- **Pipeline-based** - Process diffs through multiple stages
- **Stage System** - Organized execution: Load Rules → Match → Execute → Aggregate
- **Rule Matching** - Run different agents on different file types using glob patterns
- **Flexible Agents** - Mix LLM APIs and CLI tools in one pipeline
- **Markdown Agents** - Define agents using simple Markdown files
- **Parallel Execution** - All agents run simultaneously within their stage
- **Live Spinners** - Visual feedback for each agent (no external dependencies)
- **Configurable** - Enable/disable agents, rules, and stages
- **Global** - Works in any git repository
- **Lightweight** - Minimal dependencies

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
#
# ■ Analyzing changes...
# ◇ 8 files: 7 modified, 1 added
#    624 changes: +612 -12
# ◉ Loading agents...
# ✓ Loaded 2 agent(s)
#
# ↻ Running 2 agent(s) in parallel...
# ✓ Custom Code Review (101ms)
# ✓ Security Scanner (101ms)
#
# ✓ Pipeline completed successfully in 102ms
# ■ 2/2 agents succeeded

# Verbose mode (shows file details and prompts)
diffray --verbose

# JSON output (machine-readable)
diffray --json

# Filter by severity (show only critical)
diffray --severity=critical

# Filter by multiple severities (critical and high)
diffray --severity=critical,high

# Combine options
diffray --json --severity=critical

# Output includes:
#    ~ README.md: +141 -5
#    ~ src/cli.ts: +107 -3
#    + src/config.test.ts: +52 -0
#    ...
```

### Manage Agents

```bash
# List all agents
diffray agents list

# Show agent details
diffray agents show bug-hunter

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
diffray executors show claude-cli

# Enable/disable executors
diffray executors enable cerebras-api
diffray executors disable claude-cli
```

### Manage Rules

Rules allow you to run different agents on different file types using glob patterns. Rules are defined in Markdown files in `src/defaults/rules/`.

```bash
# List all rules
diffray rules list

# Show rule details
diffray rules show code-bugs

# Test rule matching against specific files
diffray rules test code-bugs src/cli.ts src/agents.ts README.md
# Output:
# ✓ Matched 2 file(s):
#   ● src/cli.ts
#   ● src/agents.ts
# Not matched 1 file(s):
#   ○ README.md

# Sync rules from MD files to cache
diffray rules sync
```

**Creating Custom Rules:**

Create a new `.md` file in `src/defaults/rules/` with frontmatter:

```markdown
---
id: "my-rule"
name: "My Custom Rule"
description: "Description of what this rule does"
patterns: ["**/*.ts", "**/*.tsx"]
agent: "bug-hunter"
---

Additional instructions for the agent when this rule matches.
```

**Default Rules:**
- `code-bugs`: Run bug-hunter on code files `**/*.{ts,tsx,js,jsx,py,go,rs,java,rb,php}`
- `code-security`: Run security-scan on code files `**/*.{ts,tsx,js,jsx,py,go,rs,java,rb,php}`
- `config-security`: Run security-scan on config files `**/*.{json,yaml,yml,toml}`

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
- `rules`: Cached rule configurations (synced from MD files via `diffray rules sync`)
- `stages`: Pipeline stage configurations with enabled/disabled status

### Executors Configuration

Executors define **how** to run Agents. diffray supports multiple executor types:

- **CLI Executors** - Run CLI tools like `claude`, `auggie`, etc.
- **LLM API Executors** - Call LLM APIs directly (Claude, GPT, etc.)

Executors are configured in `~/.diffray/config.json`.

#### Executor Configuration

Executors can be configured in `~/.diffray/config.json`:

```json
{
  "executors": [
    {
      "name": "claude-cli",
      "enabled": true,
      "model": "opus",
      "timeout": 180
    },
    {
      "name": "cerebras-api",
      "enabled": true,
      "model": "llama-3.1-8b",
      "temperature": 0.5,
      "maxTokens": 4096
    }
  ]
}
```

#### Executor Options

**CLI Executors (claude-cli):**
- `enabled` - Enable/disable executor
- `model` - Model to use (default: `sonnet`)
- `timeout` - Timeout in seconds (default: 120)

**API Executors (cerebras-api):**
- `enabled` - Enable/disable executor
- `model` - Model to use (default: `llama-3.3-70b`)
- `temperature` - Temperature (default: 0.7)
- `maxTokens` - Max tokens (default: 8192)

#### Linking Agents to Executors

Agents reference executors via the `executor` field in their Markdown configuration:

```markdown
---
ID: bug-hunter
Executor: claude-cli
---
```

## Agent Configuration

Agents are configured using **Markdown files** in `src/defaults/agents/`. See the [Agent Configuration Guide](./docs/AGENTS.md) for complete documentation.

### Agent Markdown Format

Each agent is defined in a `.md` file with frontmatter metadata:

```markdown
# Agent: Bug Hunter

---
ID: bug-hunter
Order: 1
Enabled: true
Executor: claude-cli
---

## Description

Detects bugs, logic errors and runtime issues in code.

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
⚡ diffray - AI Code Review

■ Analyzing changes...

Summary: 2 modified, 1 added

================================================================================

src/index.ts (modified)

+ export function greet(name: string): string {
+   return `Hello, ${name}!`;
+ }

--------------------------------------------------------------------------------

✓ Reviewed 3 file(s)
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
│   ├── defaults/            # Default agents and rules (Markdown)
│   ├── git.ts               # Git operations
│   └── issue-formatter.ts   # Issue formatting
└── package.json
```

## Roadmap

- [ ] Interactive mode with file selection
- [ ] Export reports to markdown/HTML
- [ ] Integration with GitHub/GitLab
- [ ] Token batching for large diffs
- [ ] Caching for repeated reviews

## Built With

- [Bun](https://bun.sh) - Fast JavaScript runtime
- TypeScript - Type safety

## License

MIT
