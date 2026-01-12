/**
 * CLI command: diffray extends
 *
 * Manage extends - download agents and rules from GitHub repositories
 */

import { defineCommand } from 'citty';
import { updateExtends, listExtends, removeExtendByRef } from '../../commands/update';

export const extendsCmd = defineCommand({
  meta: {
    name: 'extends',
    description: `Manage extends (external agents and rules from git)

Examples:
  diffray extends install                              # Install from config
  diffray extends install https://github.com/org/repo  # Install specific URL
  diffray extends install --force                      # Force re-clone
  diffray extends list                                 # List installed
  diffray extends remove https://github.com/org/repo   # Remove`,
  },
  subCommands: {
    install: {
      meta: {
        description: 'Install extends from config or specific URL',
      },
      args: {
        url: {
          type: 'positional',
          description: 'Git URL to install (optional, reads from config if not provided)',
          required: false,
        },
        force: {
          type: 'boolean',
          description: 'Force re-download even if already installed',
          alias: 'f',
        },
        global: {
          type: 'boolean',
          description: 'Add to global config (~/.diffray/config.json) instead of project',
          alias: 'g',
        },
      },
      run: async ({ args }) => {
        await updateExtends({
          force: args.force,
          url: args.url as string | undefined,
          global: args.global,
        });
      },
    },
    list: {
      meta: {
        description: 'List installed extends',
      },
      run: async () => {
        await listExtends();
      },
    },
    remove: {
      meta: {
        description: 'Remove an installed extend',
      },
      args: {
        ref: {
          type: 'positional',
          description: 'Git URL (e.g., https://github.com/owner/repo)',
          required: true,
        },
      },
      run: async ({ args }) => {
        if (!args.ref) {
          throw new Error('Extend reference is required');
        }
        await removeExtendByRef(args.ref);
      },
    },
  },
});
