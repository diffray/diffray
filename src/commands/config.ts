import { spawnSync } from 'node:child_process';
import {
  loadConfig,
  getDefaultConfig,
  saveGlobalConfig,
  getGlobalConfigPath,
  getProjectConfigPath,
  globalConfigExists,
  projectConfigExists,
  initProjectConfig,
} from '../config';
import { log } from '../logger';

/**
 * Show current configuration (merged: defaults + global + project)
 */
export async function showConfig(projectPath?: string): Promise<void> {
  const resolvedPath = projectPath || process.cwd();
  const config = await loadConfig(resolvedPath);

  const globalPath = getGlobalConfigPath();
  const projectConfigPath = getProjectConfigPath(resolvedPath);

  const hasGlobal = await globalConfigExists();
  const hasProject = await projectConfigExists(resolvedPath);

  log.plain('Configuration\n');
  log.plain(`Global:  ${globalPath}${hasGlobal ? '' : ' (not found)'}`);
  log.plain(`Project: ${projectConfigPath}${hasProject ? '' : ' (not found)'}`);
  log.plain('\nMerged config:\n');
  log.plain(JSON.stringify(config, null, 2));
}

/**
 * Initialize project configuration (.diffray.json)
 */
export async function initConfig(projectPath?: string): Promise<void> {
  const resolvedPath = projectPath || process.cwd();

  const exists = await projectConfigExists(resolvedPath);
  if (exists) {
    log.warn('Project config already exists');
    log.plain(`Location: ${getProjectConfigPath(resolvedPath)}`);
    return;
  }

  const configPath = await initProjectConfig(resolvedPath);
  log.success('Project config created');
  log.plain(`Location: ${configPath}`);
  log.plain('\nEdit the file to override global settings.');
}

/**
 * Edit configuration file in default editor
 */
export async function editConfig(options: {
  global?: boolean;
  projectPath?: string;
}): Promise<void> {
  const editor = process.env.EDITOR || 'nano';

  let path: string;
  if (options.global) {
    path = getGlobalConfigPath();
    const exists = await globalConfigExists();
    if (!exists) {
      log.warn('Global config does not exist. Creating with defaults...');
      await saveGlobalConfig(getDefaultConfig());
    }
  } else {
    const projectPath = options.projectPath || process.cwd();
    const exists = await projectConfigExists(projectPath);
    if (!exists) {
      log.warn('Project config does not exist. Run `diffray config init` first.');
      return;
    }
    path = getProjectConfigPath(projectPath);
  }

  log.info(`Opening ${path} in ${editor}...`);

  const result = spawnSync(editor, [path], { stdio: 'inherit' });
  if (result.error) {
    log.error(`Failed to open editor: ${result.error.message}`);
    process.exit(1);
  }
}
