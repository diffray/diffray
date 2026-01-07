import { defineCommand } from 'citty';
import { listAgents, showAgent, syncAgents } from '../../commands/agents.js';

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
    sync: {
      meta: {
        description: 'Sync agents from MD files to cache',
      },
      run: () => {
        syncAgents();
      },
    },
  },
});
