import { access, mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { log } from '../logger';

const execFileAsync = promisify(execFile);

const COMMAND_FILENAME = 'diffray.md';

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

## Mode

### If \`$ARGUMENTS\` contains options:
Pass them directly to diffray without asking:
\`\`\`bash
diffray review $ARGUMENTS
\`\`\`

### If \`$ARGUMENTS\` is empty:
Ask the user what to review using AskUserQuestion tool:

**Question:** "What would you like to review?"
**Options:**
1. **Uncommitted changes** - Review current unstaged/staged changes
2. **Last commit** - Review the most recent commit
3. **Branch vs main** - Review all changes in current branch compared to main
4. **Specific files** - Let me specify which files to review

Then run the appropriate command:
- Uncommitted changes: \`diffray review\`
- Last commit: \`diffray review --base HEAD~1\`
- Branch vs main: \`diffray review --branch .\`
- Specific files: Ask which files, then run \`diffray review --files <files>\`

## Common Usage Examples

- \`/diffray\` - Interactive mode (asks what to review)
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
 * Install /diffray command to Claude Code and other supported tools
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
    log.plain('/diffray command requires one of the following CLI tools:');
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
    const commandPath = join(target.path, COMMAND_FILENAME);

    // Check if already exists
    if ((await fileExists(commandPath)) && !options.force) {
      try {
        const existing = await readFile(commandPath, 'utf-8');
        if (existing === COMMAND_TEMPLATE) {
          log.info(`${target.name}: Already installed (up to date)`);
          continue;
        }
        log.warn(`${target.name}: Already exists at ${commandPath}`);
        log.plain('   Use --force to overwrite');
        continue;
      } catch (err) {
        log.error(`${target.name}: Failed to read ${commandPath}: ${(err as Error).message}`);
        continue;
      }
    }

    // Create commands directory and write command file
    try {
      if (!(await fileExists(target.path))) {
        await mkdir(target.path, { recursive: true });
      }
      await writeFile(commandPath, COMMAND_TEMPLATE, 'utf-8');
      log.success(`${target.name}: Installed`);
      log.plain(`   ${commandPath}`);
      installed++;
    } catch (err) {
      log.error(`${target.name}: Failed to install: ${(err as Error).message}`);
      continue;
    }
  }

  if (installed > 0) {
    log.newline();
    log.success('Done! Type /diffray in your editor to run.');
  }
}

/**
 * Uninstall /diffray command from Claude Code and other supported tools
 */
export async function uninstallCommand(): Promise<void> {
  const targets = getInstallTargets();
  let removed = 0;

  for (const target of targets) {
    const commandPath = join(target.path, COMMAND_FILENAME);

    if (await fileExists(commandPath)) {
      try {
        await unlink(commandPath);
        log.success(`${target.name}: Removed`);
        log.plain(`   ${commandPath}`);
        removed++;
      } catch (err) {
        log.error(`${target.name}: Failed to remove: ${(err as Error).message}`);
      }
    }
  }

  if (removed === 0) {
    log.info('No installations found');
  } else {
    log.newline();
    log.success(`Removed ${removed} installation(s)`);
  }
}

/**
 * Show installation status
 */
export async function showInstallStatus(): Promise<void> {
  const targets = getInstallTargets();

  log.plain('Installation Status\n');

  const statuses = await Promise.all(
    targets.map(async (target) => {
      const commandPath = join(target.path, COMMAND_FILENAME);
      return {
        target,
        commandPath,
        cliAvailable: await isCommandAvailable(target.cliCommand),
        commandExists: await fileExists(commandPath),
      };
    })
  );

  for (const { target, commandPath, cliAvailable, commandExists } of statuses) {
    if (!cliAvailable) {
      log.plain(`${target.name}: CLI not found (${target.cliCommand})`);
      log.plain(`   Install: ${target.installUrl}`);
    } else if (commandExists) {
      log.success(`${target.name}: Installed`);
      log.plain(`   ${commandPath}`);
    } else {
      log.warn(`${target.name}: CLI available but command not installed`);
      log.plain(`   Run: diffray setup-command`);
    }
  }
}
