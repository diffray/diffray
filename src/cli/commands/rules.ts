import { defineCommand } from 'citty';
import { listRules, showRule, testRule } from '../../commands/rules.js';

export const rulesCmd = defineCommand({
  meta: {
    name: 'rules',
    description: `List rules or show rule details

Examples:
  diffray rules                          # List all rules
  diffray rules simplicity               # Show simplicity rule details
  diffray rules test simplicity src/*.ts # Test rule pattern matching`,
  },
  args: {
    name: {
      type: 'positional',
      description: 'Rule name or "test" subcommand',
      required: false,
    },
    rest: {
      type: 'positional',
      description: 'For test: <rule-name> <files...>',
      required: false,
    },
  },
  run: async ({ args }) => {
    if (args.name === 'test') {
      const restArgs = (args._ || []) as string[];
      const ruleName = restArgs[0];
      const files = restArgs.slice(1);
      if (!ruleName || files.length === 0) {
        console.error('Usage: diffray rules test <rule-name> <files...>');
        process.exit(1);
      }
      await testRule(ruleName, files);
    } else if (args.name) {
      await showRule(args.name);
    } else {
      await listRules();
    }
  },
});
