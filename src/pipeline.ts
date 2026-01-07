/**
 * Pipeline for processing diffs through Agents and Executors
 */

import type {
  GitDiff,
  Agent,
  AgentExecutor,
  PipelineContext,
  PipelineResult,
  Stage,
  StageResult,
} from './types';
import { log } from './logger';
import { getDefaultStages } from './stages';
import { executorFactory } from './executors/factory';
import { agentRegistry } from './agents/registry';

export class Pipeline {
  private agents: Agent[] = [];
  private executors: Map<string, AgentExecutor> = new Map();
  private stages: Stage[] = [];

  constructor(agents: Agent[] = [], executors: AgentExecutor[] = [], stages?: Stage[]) {
    this.agents = [...agents].sort((a, b) => a.order - b.order);

    // Register executors
    for (const executor of executors) {
      this.executors.set(executor.id, executor);
      executorFactory.registerExecutor(executor);
    }

    // Register Agents
    for (const agent of agents) {
      agentRegistry.register(agent);
    }

    this.stages = stages || getDefaultStages();
  }

  /**
   * Add Agent to pipeline
   */
  addAgent(agent: Agent): void {
    this.agents.push(agent);
    this.agents.sort((a, b) => a.order - b.order);
    agentRegistry.register(agent);
  }

  /**
   * Remove Agent from pipeline
   */
  removeAgent(agentId: string): void {
    this.agents = this.agents.filter((a) => a.id !== agentId);
    agentRegistry.remove(agentId);
  }

  /**
   * Get all Agents
   */
  getAgents(): Agent[] {
    return this.agents;
  }

  /**
   * Get enabled Agents
   */
  getEnabledAgents(): Agent[] {
    return this.agents.filter((a) => a.enabled);
  }

  /**
   * Add Executor to pipeline
   */
  addExecutor(executor: AgentExecutor): void {
    this.executors.set(executor.id, executor);
    executorFactory.registerExecutor(executor);
  }

  /**
   * Get Executor by ID
   */
  getExecutor(executorId: string): AgentExecutor | undefined {
    return this.executors.get(executorId);
  }

  /**
   * Execute pipeline
   */
  async execute(diffs: GitDiff[], verbose = false, quiet = false): Promise<PipelineResult> {
    const startTime = Date.now();

    // Create context
    const context: PipelineContext = {
      diffs,
      results: [],
      issues: [],
      metadata: {
        timestamp: Date.now(),
        repository: process.cwd(),
      },
      verbose,
      quiet,
    };

    // Execute stages
    const stageResults: StageResult[] = [];

    for (const stage of this.stages) {
      if (!stage.enabled) {
        continue;
      }

      try {
        const result = await stage.execute(context);
        stageResults.push(result);

        if (!result.success) {
          log.error(`Stage ${stage.name} failed: ${result.error}`);
          break;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error(`Stage ${stage.name} failed: ${errorMessage}`);
        stageResults.push({
          stageId: stage.id,
          stageName: stage.name,
          success: false,
          duration: 0,
          error: errorMessage,
        });
        break;
      }
    }

    const totalDuration = Date.now() - startTime;

    return {
      success: stageResults.every((r) => r.success),
      context,
      totalDuration,
      stages: stageResults,
    };
  }
}
