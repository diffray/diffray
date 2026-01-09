import { defineCommand } from 'citty';
import { listAgents, showAgent } from '../../commands/agents.js';

export const agentsCmd = defineCommand({
  meta: {
    name: 'agents',
    description: `List agents or show agent details

Examples:
  diffray agents              # List all agents
  diffray agents validation   # Show validation agent details
  diffray agents general      # Show general agent details`,
  },
  args: {
    name: {
      type: 'positional',
      description: 'Agent name (optional, shows details if provided)',
      required: false,
    },
  },
  run: async ({ args }) => {
    if (args.name) {
      await showAgent(args.name);
    } else {
      await listAgents();
    }
  },
});
