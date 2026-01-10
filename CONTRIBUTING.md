# Contributing to diffray

Thanks for your interest in contributing to diffray! This document provides guidelines and instructions for contributing.

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- Git
- Claude Code CLI or Cursor Agent CLI (for testing)

### Setup

```bash
# Clone the repository
git clone https://github.com/diffray/diffray.git
cd diffray

# Install dependencies
npm install

# Link for local development
npm run link:local

# Now you can run diffray from anywhere
diffray --help
```

## Development Workflow

### Running in Development Mode

```bash
# Run CLI directly with tsx (no build needed)
npm run dev

# Or run with arguments
npm run dev -- --base main --stream
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- md-loader

# Watch mode
npm run test:watch
```

### Code Quality

```bash
# Type checking
npm run ts-check

# Linting
npm run lint
npm run lint:fix

# Formatting
npm run format
npm run format:check
```

### Building

```bash
# Build to dist/diffray.cjs
npm run build
```

## Project Structure

```
src/
├── cli.ts                # Main CLI entry point
├── pipeline.ts           # Pipeline orchestration
├── types.ts              # TypeScript interfaces
├── config.ts             # Configuration loading
├── stages/               # Pipeline stages
│   ├── load-rules.ts
│   ├── match-rules.ts
│   ├── review.ts
│   ├── deduplication.ts
│   └── validation.ts
├── executors/            # Executor implementations
│   ├── cli.ts
│   ├── claude-cli.ts
│   └── api.ts
├── agents/               # Agent loading
│   └── md-loader.ts
└── defaults/             # Built-in agents, rules, prompts
    ├── agents/*.md
    ├── rules/*.md
    └── prompts/*.md
```

## How to Contribute

### Reporting Bugs

1. Check if the bug is already reported in [Issues](https://github.com/diffray/diffray/issues)
2. If not, create a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment info (OS, Node version, diffray version)

### Suggesting Features

1. Check existing [Issues](https://github.com/diffray/diffray/issues) for similar suggestions
2. Create a new issue with:
   - Clear description of the feature
   - Use case / why it's useful
   - Proposed implementation (optional)

### Submitting Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes
4. Run tests and linting: `npm test && npm run lint`
5. Commit with conventional commit message (see below)
6. Push to your fork
7. Open a Pull Request

### Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new feature
fix: fix a bug
docs: update documentation
refactor: refactor code without changing behavior
test: add or update tests
chore: maintenance tasks
```

Examples:
```
feat: add --exclude-agent flag for filtering agents
fix: handle empty diff gracefully
docs: add CI/CD example to README
refactor: simplify executor initialization
```

## Adding New Features

### Adding a New Agent

1. Create `src/defaults/agents/my-agent.md`:

```markdown
---
name: my-agent
description: What this agent checks for
enabled: true
order: 5
---

You are a code reviewer focused on [specific area].

## What to check:
1. ...
2. ...

## How to report:
- Use severity: critical, high, medium, low
- Be specific about file and line
```

2. Test it: `npm run dev -- --agent my-agent`

### Adding a New Executor

1. Create `src/executors/my-executor.ts`:

```typescript
import { Executor, ExecutionContext, ExecutionResult } from './types';

export function createMyExecutor(): Executor {
  return {
    name: 'my-executor',
    type: 'cli', // or 'llm-api'
    enabled: true,

    async execute(context: ExecutionContext): Promise<ExecutionResult> {
      // Implementation
    },

    getInfo() {
      return { name: 'my-executor', type: 'cli' };
    }
  };
}
```

2. Register in `src/executors/index.ts`

### Adding a New Stage

1. Create `src/stages/my-stage.ts`:

```typescript
import { Stage, PipelineContext, StageResult } from '../types';

export function createMyStage(): Stage {
  return {
    id: 'my-stage',
    name: 'My Stage',
    enabled: true,

    async execute(context: PipelineContext): Promise<StageResult> {
      // Implementation
      return { success: true };
    }
  };
}
```

2. Add to stage list in `src/stages/index.ts`

## Code Style

- Use TypeScript strict mode
- Prefer `const` over `let`
- Use async/await over callbacks
- Keep functions small and focused
- Add JSDoc comments for public APIs
- No `.js` extensions in imports (bundler resolution)

## Testing

- Write tests for new features
- Test edge cases (empty input, errors, etc.)
- Use descriptive test names
- Keep tests focused and independent

```typescript
import { describe, it, expect } from 'vitest';

describe('myFunction', () => {
  it('should handle empty input', () => {
    expect(myFunction('')).toBe(null);
  });

  it('should process valid input', () => {
    expect(myFunction('valid')).toBe('result');
  });
});
```

## Questions?

- Open an [Issue](https://github.com/diffray/diffray/issues) for questions
- Check [README.md](README.md) for usage documentation
- Check [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for architecture details

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
