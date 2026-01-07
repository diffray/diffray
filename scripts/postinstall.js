#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import process from 'process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  try {
    if (process.env.DIFFRAY_SKIP_DOWNLOAD === '1') {
      console.log('Skipping diffray binary download (DIFFRAY_SKIP_DOWNLOAD=1)');
      process.exit(0);
    }

    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const version = packageJson.version;

    const platform = process.platform;
    const arch = process.arch;

    const platformArchMap = {
      'darwin-arm64': 'diffray-darwin-arm64',
      'darwin-x64': 'diffray-darwin-x64',
      'linux-arm64': 'diffray-linux-arm64',
      'linux-x64': 'diffray-linux-x64',
      'win32-x64': 'diffray-win-x64.exe'
    };

    const platformArch = `${platform}-${arch}`;
    const binaryName = platformArchMap[platformArch];

    if (!binaryName) {
      console.error(`Unsupported platform: ${platformArch}`);
      process.exit(1);
    }

    console.log(`Downloading diffray v${version} for ${platformArch}...`);

    const url = `https://github.com/diffray/diffray/releases/download/v${version}/${binaryName}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`Failed to download binary: ${response.status} ${response.statusText}`);
      process.exit(1);
    }

    const binDir = path.join(__dirname, '..', '.bin');
    if (!fs.existsSync(binDir)) {
      fs.mkdirSync(binDir, { recursive: true });
    }

    const outputPath = platform === 'win32' 
      ? path.join(binDir, 'diffray.exe')
      : path.join(binDir, 'diffray');

    const buffer = await response.arrayBuffer();
    fs.writeFileSync(outputPath, new Uint8Array(buffer));

    if (platform !== 'win32') {
      fs.chmodSync(outputPath, 0o755);
    }

    console.log('Successfully installed diffray binary');
    process.exit(0);
  } catch (error) {
    console.error('Error installing diffray binary:', error.message);
    process.exit(1);
  }
}

main();