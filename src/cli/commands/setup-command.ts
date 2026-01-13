import { defineCommand } from 'citty';
import {
  installCommand,
  uninstallCommand,
  showInstallStatus,
} from '../../commands/setup-command.js';

export const setupCommandCmd = defineCommand({
  meta: {
    name: 'setup-command',
    description: `Install /diffray command for Claude Code, Cursor Agent, OpenCode, and other editors

Examples:
  diffray setup-command             # Install command
  diffray setup-command --force     # Overwrite existing
  diffray setup-command status      # Show installation status
  diffray setup-command remove      # Remove command from all tools`,
  },
  args: {
    force: {
      type: 'boolean',
      description: 'Overwrite existing installation',
      alias: 'f',
    },
  },
  subCommands: {
    status: {
      meta: {
        description: 'Show installation status',
      },
      run: async () => {
        await showInstallStatus();
      },
    },
    remove: {
      meta: {
        description: 'Remove /diffray command from all tools',
      },
      run: async () => {
        await uninstallCommand();
      },
    },
  },
  run: async ({ args, rawArgs }) => {
    // Don't run install if a subcommand was specified
    const subCommandNames = Object.keys(setupCommandCmd.subCommands || {});
    const hasSubCommand = rawArgs.some((arg) => subCommandNames.includes(arg));
    if (hasSubCommand) {
      return;
    }
    await installCommand({ force: args.force });
  },
});
