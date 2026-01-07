import { defineCommand } from 'citty';
import {
  showConfig,
  initConfig,
  resetConfigCommand,
  setConfigValue,
  getConfigValue,
  editConfig,
} from '../../commands/config.js';

export const configCmd = defineCommand({
  meta: {
    name: 'config',
    description: 'Manage configuration',
  },
  subCommands: {
    show: {
      meta: {
        description: 'Show current configuration',
      },
      run: () => {
        showConfig();
      },
    },
    init: {
      meta: {
        description: 'Initialize configuration file',
      },
      run: () => {
        initConfig();
      },
    },
    reset: {
      meta: {
        description: 'Reset to default configuration',
      },
      run: () => {
        resetConfigCommand();
      },
    },
    set: {
      meta: {
        description: 'Set configuration value',
      },
      args: {
        key: {
          type: 'positional',
          description: 'Configuration key',
          required: true,
        },
        value: {
          type: 'positional',
          description: 'Configuration value',
          required: true,
        },
      },
      run: ({ args }) => {
        setConfigValue(args.key!, args.value!);
      },
    },
    get: {
      meta: {
        description: 'Get configuration value',
      },
      args: {
        key: {
          type: 'positional',
          description: 'Configuration key',
          required: true,
        },
      },
      run: ({ args }) => {
        getConfigValue(args.key!);
      },
    },
    edit: {
      meta: {
        description: 'Edit configuration in $EDITOR',
      },
      run: () => {
        editConfig();
      },
    },
  },
});
