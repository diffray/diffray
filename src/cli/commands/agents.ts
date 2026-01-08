import { defineCommand } from 'citty';
import { listAgents, showAgent } from '../../commands/agents.js';

export const agentsCmd = defineCommand({
  meta: {
    name: 'agents',
    description: 'Manage review agents',
  },
  subCommands: {
    list: {
      meta: {
        description: 'List all agents',
      },
      run: () => {
        listAgents();
      },
    },
    show: {
      meta: {
        description: 'Show agent details',
      },
      args: {
        id: {
          type: 'positional',
          description: 'Agent ID',
          required: true,
        },
      },
      run: ({ args }) => {
        showAgent(args.id!);
      },
    },
  },
});
