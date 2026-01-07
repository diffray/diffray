import { defineCommand } from 'citty';
import { showCache, clearCache, explainCache } from '../../commands/cache.js';

export const cacheCmd = defineCommand({
  meta: {
    name: 'cache',
    description: 'Manage cache',
  },
  subCommands: {
    show: {
      meta: {
        description: 'Show cache contents',
      },
      run: () => {
        showCache();
      },
    },
    clear: {
      meta: {
        description: 'Clear all cache',
      },
      run: () => {
        clearCache();
      },
    },
    explain: {
      meta: {
        description: 'Explain cache system',
      },
      run: () => {
        explainCache();
      },
    },
  },
});
