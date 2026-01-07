/**
 * Agent Registry - Agent management with domain-specific operations
 */

import type { Agent } from '../types';
import { Registry } from '../registry.js';

/**
 * Agent Registry - extends base Registry with Agent-specific operations
 */
export class AgentRegistry extends Registry<Agent> {
  /**
   * List enabled Agents sorted by order
   */
  listEnabled(): Agent[] {
    return this.list().filter((a) => a.enabled);
  }

  /**
   * Enable Agent
   */
  enable(id: string): void {
    const agent = this.get(id);
    if (agent) {
      agent.enabled = true;
    }
  }

  /**
   * Disable Agent
   */
  disable(id: string): void {
    const agent = this.get(id);
    if (agent) {
      agent.enabled = false;
    }
  }

  /**
   * Change Agent executor
   */
  setExecutor(id: string, executor: string): void {
    const agent = this.get(id);
    if (agent) {
      agent.executor = executor;
    }
  }

  /**
   * Get count of enabled Agents
   */
  countEnabled(): number {
    return this.list().filter((a) => a.enabled).length;
  }
}

/**
 * Global Agent registry instance
 */
export const agentRegistry = new AgentRegistry();
