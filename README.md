<p align="center">
  <img src="logo.svg" alt="diffray" width="200">
</p>

<h1 align="center">diffray</h1>

<p align="center">
  <strong>AI code reviewer that finds real bugs in your code</strong>
</p>

## Table of Contents

**Getting Started**
- [What is diffray?](#what-is-diffray)
- [Quick Start](#quick-start) · [Quick Reference](#quick-reference)
- [Prerequisites](#prerequisites)
- [Common Commands](#common-commands)
- [How It Works](#how-it-works)

**Customization**
- [Configuration](#configuration-optional)
- [Creating Custom Agents](#creating-custom-agents)
- [Creating Custom Rules](#creating-custom-rules)
- [Overriding Agents and Rules](#overriding-agents-and-rules)

**Reference**
- [FAQ](#faq)
- [Development](#development)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

---

> **Note:** This is a lightweight, open-source version of diffray. While inspired by the [diffray.ai](https://diffray.ai) platform, it differs significantly from the full cloud solution. The main difference is the lack of automatic feedback collection and rule generation based on your team's review history — though you can implement custom rules yourself. Thanks to powerful CLI agents like [Claude Code](https://github.com/anthropics/claude-code) and [Cursor Agent](https://cursor.com), this version can perform code reviews at a professional level. However, be aware that token consumption can grow significantly with many rules and changed files.

## What is diffray?

diffray automatically reviews your code changes and finds bugs, security issues, and performance problems **before** you commit or create a PR.

Think of it as having a senior developer review your code 24/7.

```
You write code → diffray analyzes it → You get a list of issues to fix
```

### What it finds:

- **Bugs** - logic errors, null pointer exceptions, race conditions
- **Security issues** - SQL injection, XSS, exposed secrets
- **Performance problems** - memory leaks, slow queries, unnecessary re-renders

### Example output:

```
⚡ diffray - AI Code Review

■ Found 2 issues:

┌─────────────────────────────────────────────────────────────────────────────┐
│ CRITICAL | security | src/api/auth.ts:45                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ SQL Injection vulnerability                                                 │
│                                                                             │
│ User input is directly concatenated into SQL query without sanitization.    │
│ An attacker could execute arbitrary SQL commands.                           │
│                                                                             │
│ Suggestion: Use parameterized queries instead of string concatenation       │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ HIGH | bug | src/utils/parser.ts:23                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ Possible null pointer exception                                             │
│                                                                             │
│ data.user can be undefined, but .name is accessed without null check.       │
│                                                                             │
│ Suggestion: Add optional chaining: data.user?.name                          │
└─────────────────────────────────────────────────────────────────────────────┘

✓ Review completed in 12s
```

## Quick Start

### 1. Install diffray

```bash
# Install globally from npm
npm install -g diffray
```

### 2. Run your first review

```bash
# Go to your project
cd your-project

# Review your uncommitted changes (or last commit if working tree is clean)
diffray

# Or review changes between branches
diffray --base main
```

That's it! diffray will analyze your changes and show any issues found.

### Quick Reference

| Command | What it does |
|---------|--------------|
| `diffray` | Review uncommitted changes (or last commit if clean) |
| `diffray --base main` | Review changes vs main branch |
| `diffray --severity critical,high` | Show only critical/high issues |
| `diffray --agent bug-hunter` | Run only specific agent |
| `diffray --json` | Output as JSON (for CI/CD) |
| `diffray agents` | List available agents |
| `diffray rules` | List available rules |

## Prerequisites

- **Git** - your project must be a git repository
- **AI CLI Tool** - diffray uses external AI tools to analyze code. You need to install and authorize one of them:

### Claude Code CLI (default)

Claude Code is an official Anthropic CLI tool with agentic capabilities.

```bash
# Install
npm install -g @anthropic-ai/claude-code

# Authorize (opens browser for OAuth)
claude auth login
```

### Cursor Agent CLI (alternative)

If you use Cursor IDE, you can use its agent CLI instead:

```bash
# Install
curl https://cursor.com/install -fsS | bash

# Authorize (opens browser)
cursor-agent auth
```

Then switch diffray to use it:

```bash
# Via config
diffray config init
# Edit .diffray.json and add: "executor": "cursor-agent-cli"

# Or per-run
diffray review --executor cursor-agent-cli
```

### ⚠️ Token Usage & Costs

**Important:** diffray consumes AI tokens during analysis. Each review typically uses:

| Review size | Tokens | Estimated cost |
|-------------|--------|----------------|
| Small (1-5 files) | ~10-50K | $0.01-0.05 |
| Medium (5-20 files) | ~50-200K | $0.05-0.20 |
| Large (20+ files) | ~200K+ | $0.20+ |

Costs depend on your AI provider's pricing. Claude Code uses your Anthropic account or Claude Pro subscription. Cursor Agent uses your Cursor subscription.

**Tips to reduce costs:**
- Review smaller changesets more frequently
- Use `--agent` flag to run only specific agents
- Use `--skip-validation` to skip the validation stage (faster but more false positives)

## Common Commands

```bash
# Review uncommitted changes, or last commit if clean (most common)
diffray

# Review changes compared to main branch
diffray --base main

# Review last 3 commits
diffray --base HEAD~3

# Show only critical and high severity issues
diffray --severity critical,high

# Output as JSON (for CI/CD pipelines)
diffray --json

# Show detailed progress
diffray --stream
```

## How It Works

### Pipeline

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Git Diffs  │───▶│ Match Rules │───▶│ Run Agents  │───▶│  Deduplicate│
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                                            │                   │
                                            ▼                   ▼
                                      ┌─────────────┐    ┌─────────────┐
                                      │  Agent 1    │    │  Validate   │
                                      │  Agent 2    │    │  (filter    │
                                      │  Agent 3    │    │   false +)  │
                                      │  ...        │    └─────────────┘
                                      └─────────────┘           │
                                                                ▼
                                                         ┌─────────────┐
                                                         │   Report    │
                                                         └─────────────┘
```

### Agents

diffray uses multiple specialized AI "agents" that each focus on one type of problem:

| Agent | What it finds |
|-------|---------------|
| `general` | Code quality, readability, simplicity issues |
| `bug-hunter` | Logic errors, null checks, edge cases |
| `security-scan` | Vulnerabilities, exposed secrets |
| `performance-check` | Memory leaks, slow code |
| `consistency-check` | Inconsistent patterns, naming conventions |

Each agent analyzes your code independently, then results are:
1. **Deduplicated** - remove duplicates if multiple agents found the same issue
2. **Validated** - AI double-checks each issue to filter out false alarms

Only verified issues are shown in the final report.

> **Want to understand the architecture?** See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details on agents, executors, and the stage pipeline.

## Configuration (Optional)

diffray works out of the box with sensible defaults. But you can customize it:

### Disable an agent

Create `.diffray.json` in your project:

```json
{
  "agents": {
    "performance-check": { "enabled": false }
  }
}
```

### Exclude files from review

```json
{
  "excludePatterns": [
    "*.test.ts",
    "*.spec.ts",
    "generated/**"
  ]
}
```

### Typical project configuration

Here's a practical `.diffray.json` for a TypeScript/React project:

```json
{
  "excludePatterns": [
    "**/*.test.ts",
    "**/*.spec.ts",
    "**/__tests__/**",
    "dist/**",
    "node_modules/**"
  ],
  "agents": {
    "performance-check": { "enabled": false }
  }
}
```

### Full configuration reference

All available options (you don't need all of these):

```json
{
  "excludePatterns": ["*.test.ts", "generated/**"],
  "concurrency": 4,
  "executor": "claude-cli",
  "executors": {
    "claude-cli": {
      "review": { "model": "sonnet", "timeout": 120, "concurrency": 6 },
      "validation": { "model": "opus", "timeout": 180, "batchSize": 10 }
    }
  },
  "agents": {
    "security-scan": { "enabled": false },
    "bug-hunter": { "model": "haiku", "timeout": 60 }
  },
  "rules": {
    "code-security": { "enabled": false }
  },
  "output": {
    "colorize": true,
    "verbose": false,
    "format": "terminal"
  }
}
```

| Option | Description |
|--------|-------------|
| `excludePatterns` | Glob patterns for files to skip |
| `concurrency` | Global max parallel agents (1-10, default: **6**) |
| `executor` | Which executor to use (`claude-cli`, `cursor-agent-cli`) |
| `executors.<name>.<stage>` | Per-executor, per-stage settings |
| `agents.<name>` | Override agent settings (`enabled`, `model`, `timeout`) |
| `rules.<name>` | Override rule settings (`enabled`, `agent`) |

### Concurrency settings

Concurrency controls how many agents run in parallel. Higher values = faster reviews but more API load.

**Default:** 6 parallel agents

**Two levels of configuration:**

```json
{
  "concurrency": 6,
  "executors": {
    "claude-cli": {
      "review": { "concurrency": 6 },
      "validation": { "concurrency": 3 }
    }
  }
}
```

| Setting | What it controls |
|---------|------------------|
| `concurrency` | Global default for all stages |
| `executors.<name>.review.concurrency` | Parallel agents during review stage |
| `executors.<name>.validation.concurrency` | Parallel validations |

**Priority:** stage-specific > global

**Recommendations:**
- **Fast machine + good internet:** `6` (default)
- **Rate limited API:** `2-3`
- **Debugging:** `1` (sequential, easier to read logs)

### Config commands

```bash
# Create config file
diffray config init

# Edit config in your editor
diffray config edit

# Show current config
diffray config show
```

## Creating Custom Agents

You can create your own agents to check for anything you want! Agents are simple Markdown files.

### Where to put agent files

| Location | When to use |
|----------|-------------|
| `~/.diffray/agents/` | Your personal agents (work in all projects) |
| `.diffray/agents/` | Project-specific agents (share with team via git) |

### Agent file format

Each agent is a `.md` file with two parts:

1. **Header** (between `---` lines) - settings in YAML format
2. **Body** - instructions for the AI (what to look for)

### Step-by-step: Create your first agent

**Step 1.** Create the folder (if it doesn't exist):

```bash
mkdir -p ~/.diffray/agents
```

**Step 2.** Create a new file `~/.diffray/agents/my-rules.md`:

```markdown
---
name: my-rules
description: Checks for my team's coding standards
enabled: true
---

You are a code reviewer checking for our team's coding standards.

## What to check:

1. **No console.log** - All console.log statements should be removed before commit
2. **Function comments** - All exported functions must have a description comment
3. **Error handling** - All async functions must have try/catch blocks
4. **Naming** - Variables should have meaningful names (no single letters except in loops)

## How to report:

- Only report clear violations
- Be specific about what line and what's wrong
- Suggest how to fix it
```

**Step 3.** Verify your agent is loaded:

```bash
diffray agents
```

You should see `my-rules` in the list.

**Step 4.** Run a review - your agent will now analyze your code!

```bash
diffray
```

### Header fields explained

```yaml
---
name: my-rules              # Unique ID (lowercase, use dashes)
description: What it does   # Short description
enabled: true               # Set to false to disable temporarily
order: 10                   # Lower = runs first (optional, default: 0)
---
```

### Example agents

#### React best practices checker

```markdown
---
name: react-checker
description: Checks React code for common mistakes
enabled: true
---

You are a React expert reviewing code for common mistakes.

## Check for:

1. **Missing keys in lists** - All .map() rendering elements need unique key props
2. **useEffect dependencies** - Missing dependencies in useEffect arrays
3. **State mutations** - Direct state mutations instead of setState
4. **Memory leaks** - Missing cleanup in useEffect (event listeners, subscriptions)

## Ignore:
- Styling preferences
- Minor formatting issues
```

#### API security checker

```markdown
---
name: api-security
description: Checks API endpoints for security issues
enabled: true
---

You are a security engineer reviewing API code.

## Check for:

1. **Missing authentication** - Endpoints without auth checks
2. **SQL injection** - User input in SQL queries without parameterization
3. **Missing rate limiting** - Public endpoints without rate limits
4. **Exposed secrets** - API keys, passwords, tokens in code

## Report format:
- Severity: CRITICAL for exploitable issues, HIGH for potential issues
- Include the specific line and code snippet
- Explain the attack vector
- Provide a fix
```

#### TypeScript strict checker

```markdown
---
name: typescript-strict
description: Enforces strict TypeScript practices
enabled: true
---

You are a TypeScript expert checking for type safety.

## Check for:

1. **any type** - Usage of 'any' type (should be specific type or 'unknown')
2. **Type assertions** - Unnecessary 'as' casts that could hide errors
3. **Missing null checks** - Accessing properties that could be null/undefined
4. **Implicit any** - Function parameters without type annotations

## Ignore:
- Third-party library types
- Test files
```

### Tips for writing good agents

1. **Be specific** - "Check for console.log" is better than "check for debug code"
2. **Give examples** - Show what bad code looks like
3. **Set priorities** - Tell the AI what's important vs minor
4. **Define what to ignore** - Reduce false positives

### Managing agents

```bash
# List all agents (shows name, description, enabled status)
diffray agents

# Show full details of an agent
diffray agents bug-hunter

# Disable an agent via config (without deleting the file)
# Add to .diffray.json:
{
  "agents": {
    "my-rules": { "enabled": false }
  }
}
```

### Troubleshooting

**Agent not showing up?**
- Check file has `.md` extension
- Check file is in correct folder (`~/.diffray/agents/` or `.diffray/agents/`)
- Check YAML header syntax (must be between `---` lines)

**Agent not finding issues?**
- Make instructions more specific
- Add examples of what to look for
- Check `enabled: true` in header

## Creating Custom Rules

Rules connect agents to files. They tell diffray: "Run this agent on these files".

### What are rules?

By default, diffray runs ALL agents on ALL changed files. But with rules you can:

- Run `security-scan` agent **only** on `*.ts` files
- Run `python-checker` agent **only** on `*.py` files
- Add extra instructions for specific file types

### Where to put rule files

| Location | When to use |
|----------|-------------|
| `~/.diffray/rules/` | Your personal rules (work in all projects) |
| `.diffray/rules/` | Project-specific rules (share with team via git) |

### Rule file format

Rules are also Markdown files with a header:

```markdown
---
name: frontend-bugs
description: Bug detection for React frontend
patterns:
  - "src/components/**/*.tsx"
  - "src/hooks/**/*.ts"
agent: bug-hunter
---

Extra instructions for this rule (optional).

Focus on React-specific issues like:
- Missing useCallback/useMemo
- Incorrect dependency arrays
```

### Step-by-step: Create your first rule

**Step 1.** Create the folder:

```bash
mkdir -p ~/.diffray/rules
```

**Step 2.** Create `~/.diffray/rules/python-security.md`:

```markdown
---
name: python-security
description: Security checks for Python files
patterns:
  - "**/*.py"
agent: security-scan
---

Focus on Python-specific security issues:

1. **eval() and exec()** - Dynamic code execution
2. **pickle** - Insecure deserialization
3. **subprocess** - Command injection via shell=True
4. **SQL** - String formatting in SQL queries
5. **YAML** - yaml.load() without safe_load
```

**Step 3.** Verify your rule is loaded:

```bash
diffray rules
```

**Step 4.** Test which files match your rule:

```bash
diffray rules python-security --test src/
```

### Header fields explained

```yaml
---
name: python-security       # Unique ID (lowercase, use dashes)
description: What it does   # Short description
patterns:                   # Which files to match (glob patterns)
  - "**/*.py"               # All Python files
  - "scripts/*.sh"          # Shell scripts in scripts/ folder
agent: security-scan        # Which agent to run on matched files
---
```

### Understanding patterns (glob syntax)

Patterns use "glob" syntax to match files:

| Pattern | What it matches |
|---------|-----------------|
| `*.ts` | All `.ts` files in root folder only |
| `**/*.ts` | All `.ts` files in any folder |
| `src/**/*.ts` | All `.ts` files inside `src/` folder |
| `src/*.ts` | Only `.ts` files directly in `src/` (not subfolders) |
| `**/*.{ts,tsx}` | All `.ts` and `.tsx` files |
| `!**/*.test.ts` | Exclude test files (prefix with `!`) |

### Example rules

#### Backend API security

```markdown
---
name: api-security
description: Security review for API endpoints
patterns:
  - "src/api/**/*.ts"
  - "src/routes/**/*.ts"
  - "src/controllers/**/*.ts"
agent: security-scan
---

Focus on API security:

1. Check authentication on all endpoints
2. Validate all user input
3. Check for SQL/NoSQL injection
4. Verify rate limiting
5. Check CORS configuration
```

#### React components quality

```markdown
---
name: react-quality
description: Quality checks for React components
patterns:
  - "src/components/**/*.tsx"
  - "src/pages/**/*.tsx"
agent: bug-hunter
---

Focus on React best practices:

1. Missing key props in lists
2. useEffect dependency arrays
3. Memory leaks (missing cleanup)
4. Prop types validation
5. Conditional rendering bugs
```

#### Config files security

```markdown
---
name: config-security
description: Check config files for exposed secrets
patterns:
  - "**/*.json"
  - "**/*.yaml"
  - "**/*.yml"
  - "**/*.env.example"
agent: security-scan
---

Check for:

1. Hardcoded API keys or tokens
2. Database credentials
3. Private keys
4. Sensitive URLs
```

#### Documentation checker

```markdown
---
name: docs-quality
description: Check documentation for issues
patterns:
  - "**/*.md"
  - "docs/**/*"
agent: general
---

Check documentation for:

1. Broken links
2. Outdated code examples
3. Missing sections
4. Typos in commands
```

### Default rules (built-in)

diffray comes with these rules out of the box:

| Rule | Files | Agent |
|------|-------|-------|
| `code-general` | `*.ts, *.js, *.py, *.go, *.rs, *.java, *.rb, *.php, ...` | `general` |
| `code-bugs` | Same as above | `bug-hunter` |
| `code-security` | Same as above | `security-scan` |
| `code-performance` | Same as above | `performance-check` |
| `code-consistency` | Same as above + `*.md, *.json, *.yaml` | `consistency-check` |
| `config-security` | `*.json, *.yaml, *.yml, *.toml` | `security-scan` |

### Managing rules

```bash
# List all rules
diffray rules

# Show rule details
diffray rules code-bugs

# Test which files a rule matches
diffray rules code-bugs --test src/

# Disable a rule via config
# Add to .diffray.json:
{
  "rules": {
    "code-performance": { "enabled": false }
  }
}
```

### Rules vs Agents: What's the difference?

| | Agent | Rule |
|---|-------|------|
| **What** | The AI reviewer (what to check) | The file filter (where to check) |
| **Contains** | Instructions for AI | File patterns + which agent to use |
| **Example** | "Check for SQL injection" | "Run security-scan on *.py files" |

**Think of it this way:**
- **Agent** = The inspector (knows what problems to look for)
- **Rule** = The assignment (tells inspector which rooms to check)

### Troubleshooting

**Rule not matching files?**
- Check pattern syntax (use `**/*.ts` not `*.ts` for recursive)
- Test with `diffray rules your-rule --test path/`
- Remember patterns are relative to project root

**Agent not running on expected files?**
- Make sure rule's `agent` field matches an existing agent name
- Check that both rule and agent have `enabled: true`

## Overriding Agents and Rules

You can override built-in agents and rules without editing their original files. This is useful when you want to:

- Disable a built-in agent or rule
- Change settings for a specific project
- Override agent's model or timeout

### Override via config file

Create `.diffray.json` in your project root:

```json
{
  "agents": {
    "performance-check": { "enabled": false },
    "bug-hunter": { "model": "opus", "timeout": 180 }
  },
  "rules": {
    "code-security": { "enabled": false },
    "code-bugs": { "agent": "my-custom-agent" }
  }
}
```

### Agent overrides

| Field | What it does | Example |
|-------|--------------|---------|
| `enabled` | Turn agent on/off | `{ "enabled": false }` |
| `model` | Use different AI model | `{ "model": "opus" }` |
| `timeout` | Increase timeout (seconds) | `{ "timeout": 300 }` |

### Rule overrides

| Field | What it does | Example |
|-------|--------------|---------|
| `enabled` | Turn rule on/off | `{ "enabled": false }` |
| `agent` | Use different agent | `{ "agent": "my-agent" }` |

### Override by creating your own file

If a file with the same `name` exists in a higher-priority folder, it overrides the lower one.

**Priority order (highest to lowest):**
1. `.diffray/agents/` or `.diffray/rules/` (project folder)
2. `~/.diffray/agents/` or `~/.diffray/rules/` (home folder)
3. Built-in defaults

**Example:** To override the built-in `bug-hunter` agent, create:

```bash
# Create project-specific override
mkdir -p .diffray/agents
```

Then create `.diffray/agents/bug-hunter.md`:

```markdown
---
name: bug-hunter
description: My custom bug hunter
enabled: true
---

Your completely custom instructions here...
```

Now your version will be used instead of the built-in one.

### Common override scenarios

#### Disable security scanning for a project

```json
{
  "agents": {
    "security-scan": { "enabled": false }
  },
  "rules": {
    "code-security": { "enabled": false },
    "config-security": { "enabled": false }
  }
}
```

#### Use faster model for development

```json
{
  "agents": {
    "bug-hunter": { "model": "haiku" },
    "security-scan": { "model": "haiku" }
  }
}
```

#### Only run bug checking (disable everything else)

```json
{
  "agents": {
    "security-scan": { "enabled": false },
    "performance-check": { "enabled": false }
  },
  "rules": {
    "code-security": { "enabled": false },
    "code-performance": { "enabled": false },
    "config-security": { "enabled": false }
  }
}
```

#### Increase timeout for large files

```json
{
  "agents": {
    "bug-hunter": { "timeout": 300 },
    "security-scan": { "timeout": 300 }
  }
}
```

## FAQ

### Why is it slow?

diffray uses Claude AI which takes time to analyze code properly. Typical review takes 10-30 seconds. For faster (but less accurate) reviews, use:

```bash
diffray --skip-validation
```

### Why didn't it find an obvious bug?

AI isn't perfect. diffray is tuned for **low false positives** (fewer wrong alerts) rather than finding every possible issue. If you think it missed something, please [open an issue](https://github.com/diffray/diffray/issues).

### Can I use it in CI/CD?

Yes! Use `--json` flag for machine-readable output:

```bash
diffray --json --severity critical,high
```

Exit code is non-zero if issues are found.

**GitHub Actions example:**

```yaml
name: Code Review
on: [pull_request]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm install -g diffray @anthropic-ai/claude-code

      - run: claude auth login --api-key ${{ secrets.ANTHROPIC_API_KEY }}

      - run: diffray --base origin/${{ github.base_ref }} --json --severity critical,high
```

### How much does it cost?

The CLI is free, but uses Claude AI which has API costs. With Claude Code CLI, costs are typically $0.01-0.05 per review.

## Get Results in Your PRs

Want automated reviews directly in GitHub Pull Requests?

**Sign up at [diffray.ai](https://diffray.ai)** - connect your repo and get AI review comments on every PR automatically.

## Development

```bash
# Clone the repo
git clone https://github.com/diffray/diffray.git
cd diffray

# Install dependencies
npm install

# Run in dev mode
npm run dev

# Run tests
npm test

# Build
npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed development guidelines.

## License

MIT

---

**[Changelog](CHANGELOG.md)** · **[Contributing](CONTRIBUTING.md)** · **[Architecture](docs/ARCHITECTURE.md)**
