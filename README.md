<p align="center">
  <img src="logo.svg" alt="diffray" width="200">
</p>

<h1 align="center">diffray</h1>

<p align="center">
  <strong>Multi-agent AI code review with minimal false positives</strong>
</p>

```
Git Diffs → Specialized Agents → Deduplication → Validation → Verified Issues
```

## About This Version

This is a **simplified, lightweight version** of the full [diffray.ai](https://diffray.ai) platform — and it's **completely free**.

Despite its minimal footprint, it achieves **high bug detection rates** and **low false positive noise** by leveraging **Claude Code** as the primary executor.

Claude Code provides:
- **Deep codebase understanding** - full file access and navigation
- **Context-aware analysis** - reads related files to understand impact
- **Accurate issue validation** - verifies findings against actual code

The result: fewer false alarms, more actionable findings.

## Why diffray?

### Multi-Agent Architecture
Each agent is a specialist focused on one domain:
- **security-scan** - finds vulnerabilities with concrete attack paths
- **bug-hunter** - detects logic errors and runtime issues
- **performance-check** - identifies performance bottlenecks

Specialized agents produce higher quality findings than one generalist trying to catch everything.

### Minimal False Positives
Two-stage filtering eliminates noise:
1. **Deduplication** - removes duplicate issues across agents
2. **Validation** - LLM verifies each issue against actual code, filters out false positives

Only issues that are verified with 90%+ confidence make it to the final report.

### Flexible Execution
Agents can run via different executors:
- **claude-cli** - Claude Code with file access for deep analysis
- **cerebras-api** - Fast Cerebras API for quick checks
- Mix and match based on cost, speed, and capability needs

## Key Features

- **Multi-agent pipeline** - Specialized agents for security, bugs, performance
- **False positive filtering** - Validation stage verifies issues against actual code
- **Parallel execution** - All agents run simultaneously
- **Rule matching** - Run different agents on different file types
- **Markdown config** - Define agents and rules in simple `.md` files
- **Global CLI** - Works in any git repository
- **Zero config** - Sensible defaults, customize when needed

## Get Results in Your PRs

Want automated code reviews directly in your GitHub Pull Requests?

**Sign up at [diffray.ai](https://diffray.ai)** - connect your repo and get AI code review comments on every PR.

The hosted version includes:
- **50+ specialized rules** for TypeScript, Python, Go, Rust, and more
- **Language-specific agents** tuned for each ecosystem
- **GitHub integration** - comments appear directly on PR diffs
- **Team dashboard** - track issues across repositories

## Installation (CLI)

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
```

**Creating Custom Agents:**

Agents are defined using Markdown files! See [Agent Configuration Guide](./docs/AGENTS.md) for details.

Create a new `.md` file in `~/.diffray/agents/` or `.diffray/agents/` with frontmatter and a system prompt.

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

Rules allow you to run different agents on different file types using glob patterns. Rules are defined in Markdown files.

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
```

**Creating Custom Rules:**

Create a new `.md` file in `~/.diffray/rules/` or `.diffray/rules/` with frontmatter:

```markdown
---
name: my-rule
description: Description of what this rule does
patterns:
  - "**/*.ts"
  - "**/*.tsx"
agent: bug-hunter
---

Additional instructions for the agent when this rule matches.
```

**Default Rules:**
- `code-bugs`: Run bug-hunter on code files `**/*.{ts,tsx,js,jsx,py,go,rs,java,rb,php}`
- `code-security`: Run security-scan on code files `**/*.{ts,tsx,js,jsx,py,go,rs,java,rb,php}`
- `config-security`: Run security-scan on config files `**/*.{json,yaml,yml,toml}`

### Configuration

diffray stores configuration in `~/.diffray/config.json`. This file stores executor settings and other preferences.

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
  "stages": [...]
}
```

**Key Sections:**

- `excludePatterns`: File patterns to exclude from review (array of glob patterns)
- `output.colorize`: Enable colored output (boolean, default: `true`)
- `output.verbose`: Show verbose output (boolean, default: `false`)
- `output.format`: Output format - `terminal`, `markdown`, or `json` (default: `terminal`)
- `executors`: Executor configurations (managed via `diffray executors` commands)
- `stages`: Pipeline stage configurations with enabled/disabled status

**Dynamic Data (loaded from MD files on each run):**
- `agents`: Loaded from `~/.diffray/agents/`, `.diffray/agents/`, `src/defaults/agents/`
- `rules`: Loaded from `~/.diffray/rules/`, `.diffray/rules/`, `src/defaults/rules/`

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
name: bug-hunter
executor: claude-cli
---
```

## Agent Configuration

Agents are configured using **Markdown files** in `src/defaults/agents/`. See the [Agent Configuration Guide](./docs/AGENTS.md) for complete documentation.

### Agent Markdown Format

Each agent is defined in a `.md` file with frontmatter metadata:

```markdown
---
name: bug-hunter
description: Detects bugs, logic errors and runtime issues
enabled: true
executor: claude-cli
---

You are a code reviewer analyzing changes for:

### Logic Errors
- Identify bugs and edge cases
- Check error handling

### Code Quality
- Assess readability
- Check naming conventions
```

The system automatically loads all `.md` files from `~/.diffray/agents/`, `.diffray/agents/`, and `src/defaults/agents/`.

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

## Built With

- [Bun](https://bun.sh) - Fast JavaScript runtime
- TypeScript - Type safety

## License

MIT
