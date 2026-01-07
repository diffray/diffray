# Diffray Backend

Simple Bun-based config synchronization server for diffray CLI.

## What it does

Provides a centralized configuration endpoint for diffray clients to:
- Sync agents, executors, rules, and stages
- Manage team-wide configuration
- Enable/disable features without updating CLI

## Quick Start

```bash
# Start server
bun run start

# Or with auto-reload on changes
bun run dev

# With custom settings
PORT=4000 API_KEY=my-secret bun run start
```

Server runs on `http://localhost:3001` by default.

## Environment Variables

- `PORT` - Server port (default: 3001)
- `API_KEY` - Authentication key (default: "diffray-secret-key")

## API Endpoints

### Main Endpoint (Unified Config)

**GET `/config`** - Get full configuration
```bash
curl -H "Authorization: Bearer diffray-secret-key" \
  http://localhost:3001/config
```

**PUT `/config`** - Replace full configuration
```bash
curl -X PUT \
  -H "Authorization: Bearer diffray-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"agents": [], "executors": [], "rules": [], "stages": []}' \
  http://localhost:3001/config
```

**PATCH `/config`** - Partial update configuration
```bash
curl -X PATCH \
  -H "Authorization: Bearer diffray-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"agents": [...]}' \
  http://localhost:3001/config
```

### Legacy Endpoints (Backward Compatibility)

- `GET /agents` - Get agents only
- `POST /agents` - Add agent
- `PUT /agents/:id` - Update agent
- `DELETE /agents/:id` - Delete agent
- `GET /executors` - Get executors only
- `POST /executors` - Add executor
- `PUT /executors/:id` - Update executor
- `DELETE /executors/:id` - Delete executor
- `GET /rules` - Get rules only
- `GET /stages` - Get stages only

### Health Check

**GET `/health`** - No authentication required
```bash
curl http://localhost:3001/health
```

## Data Storage

Config stored in `backend/data/config.json`:

```json
{
  "agents": [
    {
      "id": "code-review",
      "name": "Code Review Agent",
      "systemPrompt": "...",
      "executorId": "cerebras-api",
      "enabled": true,
      "order": 1
    }
  ],
  "executors": [
    {
      "id": "cerebras-api",
      "name": "Cerebras API",
      "type": "llm-api",
      "provider": "custom",
      "model": "llama-3.3-70b",
      "enabled": true
    }
  ],
  "rules": [],
  "stages": []
}
```

## CLI Integration

Enable backend in CLI:

```bash
# Configure CLI to use backend
diffray config set backend.url http://localhost:3001
diffray config set backend.apiKey diffray-secret-key
diffray config set backend.enabled true

# Sync from backend
diffray agents sync
diffray executors sync
```

## Security

- All endpoints (except `/health`) require `Authorization: Bearer <API_KEY>` header
- Change the default API key in production
- Use HTTPS in production
- Implement additional auth layer if needed (JWT, OAuth, etc.)

## Production Deployment

```bash
# Set secure API key
export API_KEY="your-secure-random-key-here"

# Use production port
export PORT=3001

# Start server
bun run start
```

Consider using:
- Reverse proxy (nginx, caddy)
- HTTPS/TLS
- Rate limiting
- Request logging
- Process manager (PM2, systemd)

## CORS

CORS is enabled for all origins (`*`). Restrict in production:

```typescript
// In server.ts, update CORS headers:
const headers = {
  "Access-Control-Allow-Origin": "https://your-domain.com",
  // ...
};
```
