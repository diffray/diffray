#!/usr/bin/env node

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isWindows = process.platform === 'win32';
const binaryName = isWindows ? 'diffray.exe' : 'diffray';
const binaryPath = join(__dirname, '..', '.bin', binaryName);

if (!existsSync(binaryPath)) {
  console.error(`Error: diffray binary not found at ${binaryPath}`);
  console.error('Try reinstalling: npm install -g diffray');
  process.exit(1);
}

const child = spawn(binaryPath, process.argv.slice(2), {
  stdio: 'inherit',
  windowsHide: true,
});

child.on('error', (err) => {
  console.error('Failed to start diffray:', err.message);
  process.exit(1);
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});
