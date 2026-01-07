import { defineCommand } from 'citty';
import {
  listExecutors,
  showExecutor,
  enableExecutor,
  disableExecutor,
} from '../../commands/executors.js';

export const executorsCmd = defineCommand({
  meta: {
    name: 'executors',
    description: 'Manage code review executors',
  },
  subCommands: {
    list: {
      meta: {
        description: 'List all executors',
      },
      run: () => {
        listExecutors();
      },
    },
    show: {
      meta: {
        description: 'Show executor details',
      },
      args: {
        id: {
          type: 'positional',
          description: 'Executor ID',
          required: true,
        },
      },
      run: ({ args }) => {
        showExecutor(args.id!);
      },
    },
    enable: {
      meta: {
        description: 'Enable executor',
      },
      args: {
        id: {
          type: 'positional',
          description: 'Executor ID',
          required: true,
        },
      },
      run: ({ args }) => {
        enableExecutor(args.id!);
      },
    },
    disable: {
      meta: {
        description: 'Disable executor',
      },
      args: {
        id: {
          type: 'positional',
          description: 'Executor ID',
          required: true,
        },
      },
      run: ({ args }) => {
        disableExecutor(args.id!);
      },
    },
  },
});
