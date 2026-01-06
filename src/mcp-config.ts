/**
 * Centralized MCP (Model Context Protocol) configuration
 * 
 * This module manages a global MCP configuration that can be shared
 * across multiple tools (diffray, claude code, auggie, etc.)
 * 
 * Standard location: ~/.mcp/config.json
 */

import { z } from "zod";
import { join } from "path";
import { homedir } from "os";

// MCP Server schema
export const MCPServerSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  disabled: z.boolean().optional(),
});

// MCP Configuration schema
export const MCPConfigSchema = z.object({
  mcpServers: z.record(MCPServerSchema).default({}),
});

export type MCPServer = z.infer<typeof MCPServerSchema>;
export type MCPConfig = z.infer<typeof MCPConfigSchema>;

// Global MCP config location (standard)
const MCP_DIR = join(homedir(), ".mcp");
const MCP_CONFIG_FILE = join(MCP_DIR, "config.json");

/**
 * Get default MCP configuration
 */
export function getDefaultMCPConfig(): MCPConfig {
  return MCPConfigSchema.parse({});
}

/**
 * Load MCP configuration from global location
 */
export async function loadMCPConfig(): Promise<MCPConfig> {
  try {
    const file = Bun.file(MCP_CONFIG_FILE);
    const exists = await file.exists();

    if (!exists) {
      // Create default config if it doesn't exist
      const defaultConfig = getDefaultMCPConfig();
      await saveMCPConfig(defaultConfig);
      return defaultConfig;
    }

    const content = await file.text();
    const json = JSON.parse(content);
    return MCPConfigSchema.parse(json);
  } catch (error) {
    console.warn(`Warning: Failed to load MCP config, using defaults. Error: ${error}`);
    return getDefaultMCPConfig();
  }
}

/**
 * Save MCP configuration to global location
 */
export async function saveMCPConfig(config: MCPConfig): Promise<void> {
  try {
    // Ensure MCP directory exists
    await Bun.$`mkdir -p ${MCP_DIR}`.quiet();

    // Write config file
    await Bun.write(MCP_CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (error) {
    throw new Error(`Failed to save MCP config: ${error}`);
  }
}

/**
 * Get MCP config file path
 */
export function getMCPConfigPath(): string {
  return MCP_CONFIG_FILE;
}

/**
 * Get MCP directory path
 */
export function getMCPDir(): string {
  return MCP_DIR;
}

/**
 * Check if MCP config file exists
 */
export async function mcpConfigExists(): Promise<boolean> {
  const file = Bun.file(MCP_CONFIG_FILE);
  return await file.exists();
}

/**
 * Get all enabled MCP servers
 */
export async function getEnabledMCPServers(): Promise<Record<string, MCPServer>> {
  const config = await loadMCPConfig();
  const enabled: Record<string, MCPServer> = {};

  for (const [name, server] of Object.entries(config.mcpServers)) {
    if (!server.disabled) {
      enabled[name] = server;
    }
  }

  return enabled;
}

/**
 * Add or update MCP server
 */
export async function setMCPServer(name: string, server: MCPServer): Promise<void> {
  const config = await loadMCPConfig();
  config.mcpServers[name] = server;
  await saveMCPConfig(config);
}

/**
 * Remove MCP server
 */
export async function deleteMCPServer(name: string): Promise<void> {
  const config = await loadMCPConfig();
  delete config.mcpServers[name];
  await saveMCPConfig(config);
}

/**
 * Get specific MCP server
 */
export async function getMCPServer(name: string): Promise<MCPServer | undefined> {
  const config = await loadMCPConfig();
  return config.mcpServers[name];
}

/**
 * Update MCP server environment variable
 */
export async function updateMCPServerEnv(name: string, key: string, value: string): Promise<void> {
  const config = await loadMCPConfig();
  const server = config.mcpServers[name];
  
  if (!server) {
    throw new Error(`MCP server "${name}" not found`);
  }

  if (!server.env) {
    server.env = {};
  }

  server.env[key] = value;
  await saveMCPConfig(config);
}

