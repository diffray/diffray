import { defineCommand } from 'citty';
import { listExecutors, showExecutor } from '../../commands/executors.js';

export const executorsCmd = defineCommand({
  meta: {
    name: 'executors',
    description: `List executors or show executor details

Examples:
  diffray executors              # List all executors
  diffray executors claude-cli   # Show claude-cli executor details
  diffray executors cerebras-api # Show cerebras-api executor details`,
  },
  args: {
    name: {
      type: 'positional',
      description: 'Executor name (optional, shows details if provided)',
      required: false,
    },
  },
  run: async ({ args }) => {
    if (args.name) {
      await showExecutor(args.name);
    } else {
      await listExecutors();
    }
  },
});
