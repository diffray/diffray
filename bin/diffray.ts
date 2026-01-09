#!/usr/bin/env bun

import { runMain } from 'citty';
import { main } from '../src/cli';
import { log } from '../src/logger';
import packageJson from '../package.json';

const args = process.argv.slice(2);

// Show logo before version/help output (citty handles the rest)
// This is intentional UX - logo display is not supported by citty natively
const showLogoArgs = ['-v', '--version', '-h', '--help'];
const shouldShowLogo = args.length === 0 || args.some((arg) => showLogoArgs.includes(arg));

if (shouldShowLogo) {
  log.logo();
  // For version, show version and exit (citty's version output is plain)
  if (args.includes('-v') || args.includes('--version')) {
    log.plain(`v${packageJson.version}`);
    process.exit(0);
  }
}

runMain(main);
