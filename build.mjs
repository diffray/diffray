import * as esbuild from 'esbuild';
import { cp } from 'node:fs/promises';

await esbuild.build({
  entryPoints: ['./bin/diffray.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: 'dist/diffray.cjs',
  minify: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
  external: [
    // Node.js built-ins (both bare and node: prefix)
    'fs',
    'path',
    'child_process',
    'os',
    'url',
    'util',
    'stream',
    'events',
    'readline',
    'process',
    'tty',
    'buffer',
    'assert',
    'crypto',
    'http',
    'https',
    'net',
    'zlib',
    'string_decoder',
    'node:fs',
    'node:path',
    'node:child_process',
    'node:os',
    'node:url',
    'node:util',
    'node:stream',
    'node:events',
    'node:readline',
    'node:process',
    'node:tty',
    'node:buffer',
    'node:assert',
    'node:crypto',
    'node:http',
    'node:https',
    'node:net',
    'node:zlib',
    'node:string_decoder',
    'node:fs/promises',
  ],
});

// Copy defaults directory (cross-platform)
await cp('src/defaults', 'dist/defaults', { recursive: true });

console.log('Build completed: dist/diffray.cjs');
