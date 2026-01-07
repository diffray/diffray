import { defineCommand } from 'citty';
import { listRules, showRule, testRule, syncRules } from '../../commands/rules.js';

export const rulesCmd = defineCommand({
  meta: {
    name: 'rules',
    description: 'Manage review rules',
  },
  subCommands: {
    list: {
      meta: {
        description: 'List all rules',
      },
      run: () => {
        listRules();
      },
    },
    show: {
      meta: {
        description: 'Show rule details',
      },
      args: {
        id: {
          type: 'positional',
          description: 'Rule ID',
          required: true,
        },
      },
      run: ({ args }) => {
        showRule(args.id!);
      },
    },
    test: {
      meta: {
        description: 'Test rule matching against files',
      },
      args: {
        id: {
          type: 'positional',
          description: 'Rule ID',
          required: true,
        },
        files: {
          type: 'positional',
          description: 'File paths to test',
          required: true,
        },
      },
      run: ({ args, rawArgs }) => {
        // rawArgs contains all positional args after the subcommand
        const files = rawArgs.slice(1); // Skip the rule ID
        testRule(args.id!, files.length > 0 ? files : [args.files!]);
      },
    },
    sync: {
      meta: {
        description: 'Sync rules from YAML files to cache',
      },
      run: () => {
        syncRules();
      },
    },
  },
});
