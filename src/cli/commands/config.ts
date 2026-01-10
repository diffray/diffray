import { defineCommand } from 'citty';
import { showConfig, initConfig, editConfig } from '../../commands/config.js';

export const configCmd = defineCommand({
  meta: {
    name: 'config',
    description: 'Manage configuration',
  },
  subCommands: {
    show: {
      meta: {
        description: 'Show merged configuration (defaults + global + project)',
      },
      run: async () => {
        await showConfig();
      },
    },
    init: {
      meta: {
        description: 'Initialize project config (.diffray.json)',
      },
      run: async () => {
        await initConfig();
      },
    },
    edit: {
      meta: {
        description: 'Edit configuration in $EDITOR',
      },
      args: {
        global: {
          type: 'boolean',
          description: 'Edit global config (~/.diffray/config.json)',
          alias: 'g',
        },
      },
      run: async ({ args }) => {
        await editConfig({ global: args.global });
      },
    },
  },
});
