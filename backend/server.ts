/**
 * Diffray Backend - Simple unified config sync server
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { Config } from "../src/config";

const PORT = process.env.PORT || 3001;
const API_KEY = process.env.API_KEY || "diffray-secret-key";
const DATA_DIR = join(import.meta.dir, "data");

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

const CONFIG_FILE = join(DATA_DIR, "config.json");

/**
 * Load config from file
 */
function loadConfig(): Partial<Config> {
  try {
    if (existsSync(CONFIG_FILE)) {
      const content = readFileSync(CONFIG_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (error) {
    console.warn(`Failed to load ${CONFIG_FILE}:`, error);
  }
  return {
    agents: [],
    executors: [],
    rules: [],
    stages: [],
  };
}

/**
 * Save config to file
 */
function saveConfig(config: Partial<Config>): void {
  try {
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error(`Failed to save ${CONFIG_FILE}:`, error);
    throw error;
  }
}

/**
 * Check API key
 */
function checkAuth(req: Request): boolean {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return false;

  const token = authHeader.replace("Bearer ", "");
  return token === API_KEY;
}

/**
 * JSON response helper
 */
function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Error response helper
 */
function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

/**
 * Main server
 */
const server = Bun.serve({
  port: PORT,

  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // CORS headers
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    // Handle preflight
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    // Health check (no auth required)
    if (path === "/health") {
      return jsonResponse({ status: "ok", timestamp: Date.now() });
    }

    // Check auth for all other routes
    if (!checkAuth(req)) {
      return errorResponse("Unauthorized", 401);
    }

    // Routes
    try {
      // GET /config - Get full config (agents, executors, rules, stages)
      if (path === "/config" && method === "GET") {
        const config = loadConfig();
        return jsonResponse(config);
      }

      // PUT /config - Update full config
      if (path === "/config" && method === "PUT") {
        const newConfig = await req.json();
        saveConfig(newConfig);
        return jsonResponse(newConfig);
      }

      // PATCH /config - Partial update config
      if (path === "/config" && method === "PATCH") {
        const currentConfig = loadConfig();
        const updates = await req.json();
        const mergedConfig = { ...currentConfig, ...updates };
        saveConfig(mergedConfig);
        return jsonResponse(mergedConfig);
      }

      // Legacy compatibility endpoints

      // GET /agents - Get agents only
      if (path === "/agents" && method === "GET") {
        const config = loadConfig();
        return jsonResponse(config.agents || []);
      }

      // GET /executors - Get executors only
      if (path === "/executors" && method === "GET") {
        const config = loadConfig();
        return jsonResponse(config.executors || []);
      }

      // GET /rules - Get rules only
      if (path === "/rules" && method === "GET") {
        const config = loadConfig();
        return jsonResponse(config.rules || []);
      }

      // GET /stages - Get stages only
      if (path === "/stages" && method === "GET") {
        const config = loadConfig();
        return jsonResponse(config.stages || []);
      }

      // POST /agents - Add agent
      if (path === "/agents" && method === "POST") {
        const config = loadConfig();
        const newAgent = await req.json();

        const agents = config.agents || [];
        if (agents.find(a => a.id === newAgent.id)) {
          return errorResponse(`Agent with id '${newAgent.id}' already exists`, 409);
        }

        agents.push(newAgent);
        config.agents = agents;
        saveConfig(config);
        return jsonResponse(newAgent, 201);
      }

      // PUT /agents/:id - Update agent
      if (path.startsWith("/agents/") && method === "PUT") {
        const id = path.split("/")[2];
        const config = loadConfig();
        const agents = config.agents || [];
        const index = agents.findIndex(a => a.id === id);

        if (index === -1) {
          return errorResponse(`Agent '${id}' not found`, 404);
        }

        const updatedAgent = await req.json();
        agents[index] = { ...agents[index], ...updatedAgent, id };
        config.agents = agents;
        saveConfig(config);
        return jsonResponse(agents[index]);
      }

      // DELETE /agents/:id - Delete agent
      if (path.startsWith("/agents/") && method === "DELETE") {
        const id = path.split("/")[2];
        const config = loadConfig();
        const agents = config.agents || [];
        const filtered = agents.filter(a => a.id !== id);

        if (filtered.length === agents.length) {
          return errorResponse(`Agent '${id}' not found`, 404);
        }

        config.agents = filtered;
        saveConfig(config);
        return jsonResponse({ message: `Agent '${id}' deleted` });
      }

      // POST /executors - Add executor
      if (path === "/executors" && method === "POST") {
        const config = loadConfig();
        const newExecutor = await req.json();

        const executors = config.executors || [];
        if (executors.find(e => e.id === newExecutor.id)) {
          return errorResponse(`Executor with id '${newExecutor.id}' already exists`, 409);
        }

        executors.push(newExecutor);
        config.executors = executors;
        saveConfig(config);
        return jsonResponse(newExecutor, 201);
      }

      // PUT /executors/:id - Update executor
      if (path.startsWith("/executors/") && method === "PUT") {
        const id = path.split("/")[2];
        const config = loadConfig();
        const executors = config.executors || [];
        const index = executors.findIndex(e => e.id === id);

        if (index === -1) {
          return errorResponse(`Executor '${id}' not found`, 404);
        }

        const updatedExecutor = await req.json();
        executors[index] = { ...executors[index], ...updatedExecutor, id };
        config.executors = executors;
        saveConfig(config);
        return jsonResponse(executors[index]);
      }

      // DELETE /executors/:id - Delete executor
      if (path.startsWith("/executors/") && method === "DELETE") {
        const id = path.split("/")[2];
        const config = loadConfig();
        const executors = config.executors || [];
        const filtered = executors.filter(e => e.id !== id);

        if (filtered.length === executors.length) {
          return errorResponse(`Executor '${id}' not found`, 404);
        }

        config.executors = filtered;
        saveConfig(config);
        return jsonResponse({ message: `Executor '${id}' deleted` });
      }

      // Legacy /subagents endpoint (backward compatibility)
      if (path === "/subagents" && method === "GET") {
        const config = loadConfig();
        return jsonResponse(config.agents || []);
      }

      // 404 Not Found
      return errorResponse("Not Found", 404);

    } catch (error) {
      console.error("Request error:", error);
      return errorResponse(
        error instanceof Error ? error.message : "Internal Server Error",
        500
      );
    }
  },
});

console.log(`🚀 Diffray Backend running on http://localhost:${server.port}`);
console.log(`📁 Data directory: ${DATA_DIR}`);
console.log(`🔑 API Key: ${API_KEY}`);
console.log("");
console.log("Main Endpoints:");
console.log("  GET    /health          - Health check (no auth)");
console.log("  GET    /config          - Get full config");
console.log("  PUT    /config          - Replace full config");
console.log("  PATCH  /config          - Partial update config");
console.log("");
console.log("Legacy Endpoints (backward compatibility):");
console.log("  GET    /agents          - Get agents");
console.log("  POST   /agents          - Add agent");
console.log("  PUT    /agents/:id      - Update agent");
console.log("  DELETE /agents/:id      - Delete agent");
console.log("  GET    /executors       - Get executors");
console.log("  POST   /executors       - Add executor");
console.log("  PUT    /executors/:id   - Update executor");
console.log("  DELETE /executors/:id   - Delete executor");
console.log("  GET    /rules           - Get rules");
console.log("  GET    /stages          - Get stages");
console.log("");
console.log("Authorization: Bearer <API_KEY>");
