/**
 * MCP (Model Context Protocol) management commands
 *
 * Uses centralized MCP config at ~/.mcp/config.json
 * This config is shared across all tools (diffray, claude code, auggie, etc.)
 */

import {
  loadMCPConfig,
  saveMCPConfig,
  setMCPServer,
  deleteMCPServer,
  getMCPServer,
  updateMCPServerEnv,
  getMCPConfigPath,
} from "../mcp-config";
import { log } from "../logger";

/**
 * List all MCP servers
 */
export async function listMCPServers(): Promise<void> {
  const config = await loadMCPConfig();
  const servers = config.mcpServers;

  if (Object.keys(servers).length === 0) {
    log.warn("No MCP servers configured");
    log.newline();
    log.plain("Add a server with:");
    log.plain('  diffray mcp add <name> <command> [args...]');
    log.newline();
    log.plain("Example:");
    log.plain('  diffray mcp add filesystem npx -y @modelcontextprotocol/server-filesystem /path/to/dir');
    log.newline();
    log.plain(`Config location: ${getMCPConfigPath()}`);
    return;
  }

  log.robot("MCP Servers");
  log.plain(`Location: ${getMCPConfigPath()}`);
  log.newline();

  for (const [name, server] of Object.entries(servers)) {
    const status = server.disabled ? "❌" : "✅";
    log.plain(`${status} [${name}]`);
    log.plain(`   Command: ${server.command}`);
    if (server.args && server.args.length > 0) {
      log.plain(`   Args: ${server.args.join(" ")}`);
    }
    if (server.env && Object.keys(server.env).length > 0) {
      log.plain(`   Env: ${Object.entries(server.env).map(([k, v]) => `${k}=${v}`).join(", ")}`);
    }
    log.newline();
  }
}

/**
 * Add MCP server
 */
export async function addMCPServer(name: string, command: string, args: string[] = []): Promise<void> {
  const existing = await getMCPServer(name);

  if (existing) {
    log.error(`MCP server "${name}" already exists`);
    log.plain("Use 'diffray mcp remove' to remove it first");
    process.exit(1);
  }

  await setMCPServer(name, {
    command,
    args: args.length > 0 ? args : undefined,
  });

  log.success(`Added MCP server: ${name}`);
  log.plain(`Config: ${getMCPConfigPath()}`);
}

/**
 * Remove MCP server
 */
export async function removeMCPServer(name: string): Promise<void> {
  const existing = await getMCPServer(name);

  if (!existing) {
    log.error(`MCP server "${name}" not found`);
    process.exit(1);
  }

  await deleteMCPServer(name);
  log.success(`Removed MCP server: ${name}`);
}

/**
 * Enable MCP server
 */
export async function enableMCPServer(name: string): Promise<void> {
  const server = await getMCPServer(name);

  if (!server) {
    log.error(`MCP server "${name}" not found`);
    process.exit(1);
  }

  server.disabled = false;
  await setMCPServer(name, server);
  log.success(`Enabled MCP server: ${name}`);
}

/**
 * Disable MCP server
 */
export async function disableMCPServer(name: string): Promise<void> {
  const server = await getMCPServer(name);

  if (!server) {
    log.error(`MCP server "${name}" not found`);
    process.exit(1);
  }

  server.disabled = true;
  await setMCPServer(name, server);
  log.success(`Disabled MCP server: ${name}`);
}

/**
 * Set environment variable for MCP server
 */
export async function setMCPEnv(name: string, key: string, value: string): Promise<void> {
  const server = await getMCPServer(name);

  if (!server) {
    log.error(`MCP server "${name}" not found`);
    process.exit(1);
  }

  await updateMCPServerEnv(name, key, value);
  log.success(`Set ${key}=${value} for MCP server: ${name}`);
}

/**
 * Show MCP server details
 */
export async function showMCPServer(name: string): Promise<void> {
  const server = await getMCPServer(name);

  if (!server) {
    log.error(`MCP server "${name}" not found`);
    process.exit(1);
  }

  const status = server.disabled ? "❌ Disabled" : "✅ Enabled";

  log.robot(`MCP Server: ${name}`);
  log.plain(`Status: ${status}`);
  log.plain(`Command: ${server.command}`);
  if (server.args && server.args.length > 0) {
    log.plain(`Args: ${server.args.join(" ")}`);
  }
  if (server.env && Object.keys(server.env).length > 0) {
    log.plain("Environment:");
    for (const [k, v] of Object.entries(server.env)) {
      log.plain(`  ${k}=${v}`);
    }
  }
  log.newline();
  log.plain(`Config: ${getMCPConfigPath()}`);
}

