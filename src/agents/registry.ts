/**
 * Agent Registry - Agent management
 */

import type { Agent } from "../types";

/**
 * Agent Registry - task registry
 */
export class AgentRegistry {
  private agents: Map<string, Agent> = new Map();

  /**
   * Register Agent
   */
  registerAgent(agent: Agent): void {
    this.agents.set(agent.id, agent);
  }

  /**
   * Get Agent by ID
   */
  getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  /**
   * List all Agents
   */
  listAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  /**
   * List enabled Agents sorted by order
   */
  listEnabledAgents(): Agent[] {
    return Array.from(this.agents.values())
      .filter((a) => a.enabled)
      .sort((a, b) => a.order - b.order);
  }

  /**
   * Remove Agent
   */
  removeAgent(id: string): void {
    this.agents.delete(id);
  }

  /**
   * Enable Agent
   */
  enableAgent(id: string): void {
    const agent = this.agents.get(id);
    if (agent) {
      agent.enabled = true;
    }
  }

  /**
   * Disable Agent
   */
  disableAgent(id: string): void {
    const agent = this.agents.get(id);
    if (agent) {
      agent.enabled = false;
    }
  }

  /**
   * Update Agent order
   */
  setAgentOrder(id: string, order: number): void {
    const agent = this.agents.get(id);
    if (agent) {
      agent.order = order;
    }
  }

  /**
   * Change Agent executor
   */
  setAgentExecutor(id: string, executorId: string): void {
    const agent = this.agents.get(id);
    if (agent) {
      agent.executorId = executorId;
    }
  }

  /**
   * Clear all Agents
   */
  clear(): void {
    this.agents.clear();
  }

  /**
   * Get count of Agents
   */
  count(): number {
    return this.agents.size;
  }

  /**
   * Get count of enabled Agents
   */
  countEnabled(): number {
    return Array.from(this.agents.values()).filter((a) => a.enabled).length;
  }
}

/**
 * Global Agent registry instance
 */
export const agentRegistry = new AgentRegistry();

