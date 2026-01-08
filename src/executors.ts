/**
 * Executors - Re-export from modular structure
 *
 * This file re-exports from src/executors/ for backwards compatibility.
 * The actual implementation is split into:
 *   - executors/process.ts  - Process management
 *   - executors/types.ts    - Shared types
 *   - executors/utils.ts    - Shared utilities
 *   - executors/api.ts      - API executors
 *   - executors/cli.ts      - CLI executors
 *   - executors/claude-cli.ts - Claude CLI streaming
 *   - executors/index.ts    - Registry and exports
 */

export {
  // Types
  type Executor,
  type APIConfig,
  type CLIConfig,
  type StreamOptions,

  // Registry functions
  getExecutor,
  listExecutors,
  registerExecutor,
  executeAgent,

  // Factory (compatibility)
  executorFactory,

  // High-level loaders
  loadExecutors,
  loadExcludePatterns,
} from './executors/index';
