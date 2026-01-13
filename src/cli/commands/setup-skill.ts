import { defineCommand } from 'citty';
import { installSkill, uninstallSkill, showInstallStatus } from '../../commands/setup-skill.js';

export const setupSkillCmd = defineCommand({
  meta: {
    name: 'setup-skill',
    description: `Install /diffray skill for Claude Code, OpenCode, and other editors

Examples:
  diffray setup-skill             # Install skill
  diffray setup-skill --force     # Overwrite existing
  diffray setup-skill status      # Show installation status
  diffray setup-skill remove      # Remove skill from all tools`,
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
        description: 'Remove diffray skill from all tools',
      },
      run: async () => {
        await uninstallSkill();
      },
    },
  },
  run: async ({ args, rawArgs }) => {
    // Don't run install if a subcommand was specified
    const subCommandNames = Object.keys(setupSkillCmd.subCommands || {});
    const hasSubCommand = rawArgs.some((arg) => subCommandNames.includes(arg));
    if (hasSubCommand) {
      return;
    }
    await installSkill({ force: args.force });
  },
});
