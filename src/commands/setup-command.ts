import { access, mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { log } from '../logger';

const execFileAsync = promisify(execFile);

const COMMAND_FILENAME = 'diffray.md';
const CREATE_RULE_FILENAME = 'diffray-create-rule.md';

/**
 * Check if a CLI command is available in PATH (cross-platform)
 */
async function isCommandAvailable(command: string): Promise<boolean> {
  try {
    // Try running with --version which works cross-platform
    await execFileAsync(command, ['--version']);
    return true;
  } catch {
    return false;
  }
}

const COMMAND_TEMPLATE = `---
description: Run AI-powered code review with diffray
---

# Diffray Code Review

You are running diffray, an AI-powered multi-agent code review tool.

## Executor Detection

Determine the default executor based on which editor you're running in:
- **Claude Code** → \`claude-cli\` (default)
- **Cursor Agent** → \`cursor-agent-cli\`
- **OpenCode** → \`opencode-cli\`

## Mode

### If \`$ARGUMENTS\` contains options:
Pass them directly to diffray without asking:
\`\`\`bash
diffray review $ARGUMENTS
\`\`\`

### If \`$ARGUMENTS\` is empty:
Ask questions SEQUENTIALLY using AskUserQuestion (one at a time, wait for answer before asking next):

**Step 1:** Ask "What would you like to review?"
Options:
1. **Uncommitted changes** - Review current unstaged/staged changes
2. **Last commit** - Review the most recent commit
3. **Branch vs main** - Review all changes in current branch compared to main
4. **Specific files** - Let me specify which files to review

Wait for user response.

**Step 2:** Ask "Which executor should run the review?"
Options:
1. **This editor (Recommended)** - Use the current editor as executor (claude-cli/cursor-agent-cli/opencode-cli based on where you're running)
2. **claude-cli** - Claude Code CLI
3. **cursor-agent-cli** - Cursor Agent CLI
4. **opencode-cli** - OpenCode CLI
5. **cerebras-api** - Cerebras API (fast, requires CEREBRAS_API_KEY)

Wait for user response.

**Step 3:** If user chose "Specific files" in Step 1, ask "Which files to review? (comma-separated paths)"

Wait for user response if needed.

**Step 4:** Run the appropriate command with the chosen executor:
- Uncommitted changes: \`diffray review --executor <executor>\`
- Last commit: \`diffray review --base HEAD~1 --executor <executor>\`
- Branch vs main: \`diffray review --branch . --executor <executor>\`
- Specific files: \`diffray review --files <files> --executor <executor>\`

If user chose "This editor", use the executor matching your current environment.

## Common Usage Examples

- \`/diffray\` - Interactive mode (asks what to review and which executor)
- \`/diffray --base main\` - Compare current HEAD to main branch
- \`/diffray --branch .\` - Review current branch vs main (auto-detect)
- \`/diffray --files src/auth.ts\` - Review specific file
- \`/diffray --agent security-scan\` - Run only security agent
- \`/diffray --severity critical,high\` - Show only critical/high issues
- \`/diffray --stream\` - Show streaming output with thinking
- \`/diffray --executor cursor-agent-cli\` - Use Cursor Agent as executor
- \`/diffray --executor claude-cli\` - Use Claude CLI as executor

## Output

After running the command, summarize the results:
1. Number of files reviewed
2. Issues found (grouped by severity)
3. Key recommendations

If issues are found, offer to help fix them.
`;

const CREATE_RULE_TEMPLATE = `---
description: Create a new diffray rule interactively
---

# Create Diffray Rule

You are helping the user create a new diffray rule for code review.

## Step 1: Gather Information

Use AskUserQuestion tool to collect the following information one by one:

### 1.1 Rule Name
Ask: "What should this rule be called? (use kebab-case, e.g., input-validation)"

### 1.2 Description
Ask: "What should this rule check for? Describe in a sentence."

### 1.3 Agent Selection
First, run \`diffray agents\` to see available agents.
Then ask: "Which agent should handle this rule?"
Options:
- **general** - General code quality, readability, structure
- **bug-hunter** - Bugs, logic errors, edge cases
- **security-scan** - Security vulnerabilities
- **performance-check** - Performance issues
- **consistency-check** - Code style consistency

### 1.4 File Patterns
Analyze the project structure using Glob to find common directories (src/, lib/, app/).
Then ask: "Which files should this rule apply to?"
Suggest patterns based on what you find, plus common ones:
- \`**/*.ts\` - All TypeScript files
- \`**/*.tsx\` - All React TypeScript files
- \`src/**/*.ts\` - TypeScript in src/
Allow custom input.

### 1.5 Save Location
Ask: "Where should I save this rule?"
Options:
- **Project** (.diffray/rules/) - For this project only
- **User** (~/.diffray/rules/) - For all your projects

## Step 2: Generate Rule Prompt

Based on the description, generate a detailed rule prompt. Include:

1. **Title** - Clear heading about what the rule checks
2. **What to check** - Bullet list of specific things to look for
3. **❌ Avoid** - Examples of code violations
4. **✅ Use instead** - Examples of correct patterns
5. **When to flag** - Situations where issues should be reported
6. **When NOT to flag** - False positives to avoid

## Step 3: Create Rule File

Generate the rule as a markdown file with YAML frontmatter:

\`\`\`markdown
---
name: <rule-name>
description: <description>
patterns:
  - "<pattern1>"
  - "<pattern2>"
agent: <agent-name>
---

<your generated rule prompt>
\`\`\`

Save to the chosen location:
- Project: \`.diffray/rules/<name>.md\`
- User: \`~/.diffray/rules/<name>.md\`

Create the directory if it doesn't exist.

## Step 4: Verify

After creating the file:
1. Run \`diffray rules\` to confirm the rule appears in the list
2. Run \`diffray rules <name>\` to show the rule details
3. Tell the user they can test with: \`diffray review --rule <name>\`

## Example Interaction

\`\`\`
User: /diffray-create-rule

AI: I'll help you create a new diffray rule. Let me ask a few questions.

AI: What should this rule be called? (use kebab-case)
User: zod-validation

AI: What should this rule check for?
User: All user input must be validated with Zod schemas

AI: Which agent should handle this rule?
- general (recommended for validation patterns)
- security-scan
- bug-hunter
User: general

AI: Which files should this rule apply to?
I found these directories: src/, lib/
Suggestions:
- **/*.ts (all TypeScript)
- src/**/*.ts (src only)
User: src/**/*.ts

AI: Where should I save this rule?
- Project (.diffray/rules/)
- User (~/.diffray/rules/)
User: Project

AI: Creating rule...

[Writes .diffray/rules/zod-validation.md]

AI: ✅ Created .diffray/rules/zod-validation.md

Verified with diffray rules:
- zod-validation (●) - All user input must be validated with Zod schemas

You can test it with: diffray review --rule zod-validation
\`\`\`
`;

/**
 * Command files to install
 */
interface CommandFile {
  filename: string;
  template: string;
  commandName: string;
}

const COMMAND_FILES: CommandFile[] = [
  { filename: COMMAND_FILENAME, template: COMMAND_TEMPLATE, commandName: '/diffray' },
  {
    filename: CREATE_RULE_FILENAME,
    template: CREATE_RULE_TEMPLATE,
    commandName: '/diffray-create-rule',
  },
];

interface InstallTarget {
  name: string;
  path: string;
  cliCommand: string;
  installUrl: string;
}

function getInstallTargets(): InstallTarget[] {
  const home = homedir();

  return [
    {
      name: 'Claude Code',
      path: join(home, '.claude', 'commands'),
      cliCommand: 'claude',
      installUrl: 'https://claude.ai/code',
    },
    {
      name: 'Cursor Agent',
      path: join(home, '.cursor', 'commands'),
      cliCommand: 'cursor-agent',
      installUrl: 'https://cursor.com',
    },
    {
      name: 'OpenCode',
      path: join(home, '.config', 'opencode', 'commands'),
      cliCommand: 'opencode',
      installUrl: 'https://opencode.ai',
    },
  ];
}

/**
 * Check if file exists (async)
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Install diffray commands to Claude Code and other supported tools
 */
export async function installCommand(options: { force?: boolean } = {}): Promise<void> {
  const targets = getInstallTargets();

  // Check which CLI tools are available in parallel
  const results = await Promise.all(
    targets.map(async (target) => ({
      target,
      available: await isCommandAvailable(target.cliCommand),
    }))
  );
  const availableTargets = results.filter((r) => r.available).map((r) => r.target);

  if (availableTargets.length === 0) {
    log.error('No supported CLI tools found');
    log.newline();
    log.plain('diffray commands require one of the following CLI tools:');
    log.newline();
    for (const target of targets) {
      log.plain(`  ${target.name} (${target.cliCommand})`);
      log.plain(`    Install: ${target.installUrl}`);
    }
    log.newline();
    log.plain('After installing, run: diffray setup-command');
    return;
  }

  let installed = 0;

  for (const target of availableTargets) {
    log.plain(`\n${target.name}:`);

    // Create commands directory if needed
    if (!(await fileExists(target.path))) {
      try {
        await mkdir(target.path, { recursive: true });
      } catch (err) {
        log.error(`  Failed to create directory: ${(err as Error).message}`);
        continue;
      }
    }

    // Install each command file
    for (const cmdFile of COMMAND_FILES) {
      const commandPath = join(target.path, cmdFile.filename);

      // Check if already exists
      if ((await fileExists(commandPath)) && !options.force) {
        try {
          const existing = await readFile(commandPath, 'utf-8');
          if (existing === cmdFile.template) {
            log.info(`  ${cmdFile.commandName}: Already installed (up to date)`);
            continue;
          }
          log.warn(`  ${cmdFile.commandName}: Already exists, use --force to overwrite`);
          continue;
        } catch (err) {
          log.error(`  ${cmdFile.commandName}: Failed to read: ${(err as Error).message}`);
          continue;
        }
      }

      // Write command file
      try {
        await writeFile(commandPath, cmdFile.template, 'utf-8');
        log.success(`  ${cmdFile.commandName}: Installed`);
        installed++;
      } catch (err) {
        log.error(`  ${cmdFile.commandName}: Failed to install: ${(err as Error).message}`);
      }
    }
  }

  if (installed > 0) {
    log.newline();
    const commandList = COMMAND_FILES.map((f) => f.commandName).join(', ');
    log.success(`Done! Available commands: ${commandList}`);
  }
}

/**
 * Uninstall diffray commands from Claude Code and other supported tools
 */
export async function uninstallCommand(): Promise<void> {
  const targets = getInstallTargets();
  let removed = 0;

  for (const target of targets) {
    let targetRemoved = 0;

    for (const cmdFile of COMMAND_FILES) {
      const commandPath = join(target.path, cmdFile.filename);

      if (await fileExists(commandPath)) {
        try {
          await unlink(commandPath);
          if (targetRemoved === 0) {
            log.plain(`\n${target.name}:`);
          }
          log.success(`  ${cmdFile.commandName}: Removed`);
          removed++;
          targetRemoved++;
        } catch (err) {
          log.error(`  ${cmdFile.commandName}: Failed to remove: ${(err as Error).message}`);
        }
      }
    }
  }

  if (removed === 0) {
    log.info('No installations found');
  } else {
    log.newline();
    log.success(`Removed ${removed} command file(s)`);
  }
}

/**
 * Show installation status
 */
export async function showInstallStatus(): Promise<void> {
  const targets = getInstallTargets();

  log.plain('Installation Status\n');

  // Check CLI availability and command file existence for each target
  const statuses = await Promise.all(
    targets.map(async (target) => {
      const cliAvailable = await isCommandAvailable(target.cliCommand);

      // Check each command file
      const commandStatuses = await Promise.all(
        COMMAND_FILES.map(async (cmdFile) => {
          const commandPath = join(target.path, cmdFile.filename);
          return {
            cmdFile,
            commandPath,
            exists: await fileExists(commandPath),
          };
        })
      );

      return {
        target,
        cliAvailable,
        commandStatuses,
      };
    })
  );

  for (const { target, cliAvailable, commandStatuses } of statuses) {
    log.plain(`${target.name}:`);

    if (!cliAvailable) {
      log.plain(`  CLI not found (${target.cliCommand})`);
      log.plain(`  Install: ${target.installUrl}`);
      log.newline();
      continue;
    }

    for (const { cmdFile, exists } of commandStatuses) {
      if (exists) {
        log.success(`  ${cmdFile.commandName}: Installed`);
      } else {
        log.warn(`  ${cmdFile.commandName}: Not installed`);
      }
    }

    const allInstalled = commandStatuses.every((s) => s.exists);
    if (!allInstalled) {
      log.plain(`  Run: diffray setup-command`);
    }
    log.newline();
  }
}
