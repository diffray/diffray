#!/usr/bin/env bun

import { runMain } from 'citty';
import { main } from '../src/cli';
import { log } from '../src/logger';
import packageJson from '../package.json';

const args = process.argv.slice(2);

// Handle -v / --version separately
if (args.includes('-v') || args.includes('--version')) {
  log.logo();
  log.plain(`v${packageJson.version}`);
  process.exit(0);
}

// Show logo for --help or no args
if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  log.logo();
}

runMain(main);
