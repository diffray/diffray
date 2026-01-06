/**
 * SubAgent Registry - SubAgent management
 */

import type { SubAgent } from "../types";

/**
 * SubAgent Registry - task registry
 */
export class SubAgentRegistry {
  private subAgents: Map<string, SubAgent> = new Map();

  /**
   * Register SubAgent
   */
  registerSubAgent(subAgent: SubAgent): void {
    this.subAgents.set(subAgent.id, subAgent);
  }

  /**
   * Get SubAgent by ID
   */
  getSubAgent(id: string): SubAgent | undefined {
    return this.subAgents.get(id);
  }

  /**
   * List all SubAgents
   */
  listSubAgents(): SubAgent[] {
    return Array.from(this.subAgents.values());
  }

  /**
   * List enabled SubAgents sorted by order
   */
  listEnabledSubAgents(): SubAgent[] {
    return Array.from(this.subAgents.values())
      .filter((sa) => sa.enabled)
      .sort((a, b) => a.order - b.order);
  }

  /**
   * Remove SubAgent
   */
  removeSubAgent(id: string): void {
    this.subAgents.delete(id);
  }

  /**
   * Enable SubAgent
   */
  enableSubAgent(id: string): void {
    const subAgent = this.subAgents.get(id);
    if (subAgent) {
      subAgent.enabled = true;
    }
  }

  /**
   * Disable SubAgent
   */
  disableSubAgent(id: string): void {
    const subAgent = this.subAgents.get(id);
    if (subAgent) {
      subAgent.enabled = false;
    }
  }

  /**
   * Update SubAgent order
   */
  setSubAgentOrder(id: string, order: number): void {
    const subAgent = this.subAgents.get(id);
    if (subAgent) {
      subAgent.order = order;
    }
  }

  /**
   * Change SubAgent executor
   */
  setSubAgentExecutor(id: string, executorId: string): void {
    const subAgent = this.subAgents.get(id);
    if (subAgent) {
      subAgent.executorId = executorId;
    }
  }

  /**
   * Clear all SubAgents
   */
  clear(): void {
    this.subAgents.clear();
  }

  /**
   * Get count of SubAgents
   */
  count(): number {
    return this.subAgents.size;
  }

  /**
   * Get count of enabled SubAgents
   */
  countEnabled(): number {
    return Array.from(this.subAgents.values()).filter((sa) => sa.enabled).length;
  }
}

/**
 * Global SubAgent registry instance
 */
export const subAgentRegistry = new SubAgentRegistry();

