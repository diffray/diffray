/**
 * Cache management commands
 */

import { log } from "../logger";
import * as fs from "fs";
import * as path from "path";

const CACHE_DIR = `${process.env.HOME}/.diffray`;
const CACHE_FILES = {
  agents: "subagents.json",
  executors: "executors.json",
};

/**
 * Show cache information
 */
export async function showCache(): Promise<void> {
  log.robot("Cache Information");
  log.newline();
  log.plain(`📁 Cache directory: ${CACHE_DIR}`);
  log.newline();

  // Check if cache directory exists
  if (!fs.existsSync(CACHE_DIR)) {
    log.info("Cache directory does not exist");
    return;
  }

  // Show each cache file
  for (const [type, filename] of Object.entries(CACHE_FILES)) {
    const filepath = path.join(CACHE_DIR, filename);

    if (fs.existsSync(filepath)) {
      const stats = fs.statSync(filepath);
      const size = (stats.size / 1024).toFixed(2);
      const modified = stats.mtime.toLocaleString();

      log.success(`✓ ${type}: ${filename}`);
      log.plain(`  Size: ${size} KB`);
      log.plain(`  Modified: ${modified}`);

      // Try to read and show count
      try {
        const content = await Bun.file(filepath).json();
        if (Array.isArray(content)) {
          log.plain(`  Items: ${content.length}`);
        }
      } catch (e) {
        log.warn(`  Failed to parse: ${e}`);
      }
    } else {
      log.info(`✗ ${type}: not cached`);
    }
    log.newline();
  }
}

/**
 * Clear all cache files
 */
export async function clearCache(): Promise<void> {
  log.robot("Clearing cache...");
  log.newline();

  let cleared = 0;
  let errors = 0;

  for (const [type, filename] of Object.entries(CACHE_FILES)) {
    const filepath = path.join(CACHE_DIR, filename);

    if (fs.existsSync(filepath)) {
      try {
        fs.unlinkSync(filepath);
        log.success(`✓ Cleared ${type} cache: ${filename}`);
        cleared++;
      } catch (error) {
        log.error(`✗ Failed to clear ${type}: ${error}`);
        errors++;
      }
    } else {
      log.info(`- ${type}: already empty`);
    }
  }

  log.newline();
  if (errors === 0) {
    log.success(`Cache cleared successfully (${cleared} file(s))`);
  } else {
    log.warn(`Cache cleared with ${errors} error(s)`);
  }
}

/**
 * Show what the cache contains
 */
export async function explainCache(): Promise<void> {
  log.robot("About diffray Cache");
  log.newline();

  log.plain("The cache stores data loaded from the backend to improve performance:");
  log.newline();

  log.plain("📦 Cached Data:");
  log.plain("  • Agents (subagents.json) - AI review agents configuration");
  log.plain("  • Executors (executors.json) - Executor configurations");
  log.newline();

  log.plain("🔄 Cache Behavior:");
  log.plain("  • When you run diffray, it first checks the cache");
  log.plain("  • If cache exists, it uses cached data (faster)");
  log.plain("  • If no cache, it loads from backend and saves to cache");
  log.plain("  • Use 'diffray agents sync' or 'diffray executors sync' to refresh");
  log.newline();

  log.plain("📁 Location: ~/.diffray/");
  log.newline();

  log.plain("💡 When to clear cache:");
  log.plain("  • After updating backend configuration");
  log.plain("  • When troubleshooting agent/executor issues");
  log.plain("  • If cache becomes corrupted");
  log.newline();
}
