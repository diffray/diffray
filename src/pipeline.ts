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
import { executorFactory } from './executors';
import { agentRegistry } from './agents/registry';
import { getCommitMessages } from './git';

export class Pipeline {
  private agents: Agent[] = [];
  private executors: Map<string, AgentExecutor> = new Map();
  private stages: Stage[] = [];

  constructor(agents: Agent[] = [], executors: AgentExecutor[] = [], stages?: Stage[]) {
    this.agents = [...agents].sort((a, b) => a.order - b.order);

    // Register executors
    for (const executor of executors) {
      this.executors.set(executor.name, executor);
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
  removeAgent(name: string): void {
    this.agents = this.agents.filter((a) => a.name !== name);
    agentRegistry.remove(name);
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
    this.executors.set(executor.name, executor);
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
  async execute(
    diffs: GitDiff[],
    options: {
      verbose?: boolean;
      quiet?: boolean;
      concurrency?: number;
      skipValidation?: boolean;
      stream?: boolean;
      baseRef?: string;
      headRef?: string;
    } = {}
  ): Promise<PipelineResult> {
    const {
      verbose = false,
      quiet = false,
      concurrency = 3,
      skipValidation = false,
      stream = false,
      baseRef,
      headRef,
    } = options;

    const startTime = Date.now();

    // Fetch commit messages if we have refs (for understanding change intent)
    let commitMessages: string[] = [];
    if (baseRef && headRef) {
      commitMessages = await getCommitMessages(baseRef, headRef);
      if (verbose && commitMessages.length > 0) {
        log.plain(`Fetched ${commitMessages.length} commit message(s) for context`);
      }
    }

    // Create context
    const context: PipelineContext = {
      diffs,
      results: [],
      issues: [],
      metadata: {
        timestamp: Date.now(),
        repository: process.cwd(),
        baseRef,
        headRef,
        commitMessages: commitMessages.length > 0 ? commitMessages : undefined,
      },
      verbose,
      quiet,
      stream,
      concurrency,
      skipValidation,
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
