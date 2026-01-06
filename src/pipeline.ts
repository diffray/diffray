/**
 * Pipeline for processing diffs through SubAgents and Executors
 */

import type {
  GitDiff,
  SubAgent,
  AgentExecutor,
  PipelineContext,
  AgentResult,
  PipelineResult,
  Stage,
  StageResult,
  ExecutionContext,
} from "./types";
import { log } from "./logger";
import { MultiSpinner } from "./simple-spinner";
import { getDefaultStages } from "./stages";
import { CollapsibleOutput, formatLargeBlock } from "./interactive-output";
import { parseIssuesAuto } from "./issue-parser";
import { formatIssuesByFile } from "./issue-formatter";
import { executorFactory } from "./executors/factory";
import { subAgentRegistry } from "./subagents/registry";

export class Pipeline {
  private subAgents: SubAgent[] = [];
  private executors: Map<string, AgentExecutor> = new Map();
  private stages: Stage[] = [];

  constructor(subAgents: SubAgent[] = [], executors: AgentExecutor[] = [], stages?: Stage[]) {
    this.subAgents = [...subAgents].sort((a, b) => a.order - b.order);
    
    // Register executors
    for (const executor of executors) {
      this.executors.set(executor.id, executor);
      executorFactory.registerExecutor(executor);
    }
    
    // Register SubAgents
    for (const subAgent of subAgents) {
      subAgentRegistry.registerSubAgent(subAgent);
    }
    
    this.stages = stages || getDefaultStages();
  }

  /**
   * Add SubAgent to pipeline
   */
  addSubAgent(subAgent: SubAgent): void {
    this.subAgents.push(subAgent);
    this.subAgents.sort((a, b) => a.order - b.order);
    subAgentRegistry.registerSubAgent(subAgent);
  }

  /**
   * Remove SubAgent from pipeline
   */
  removeSubAgent(subAgentId: string): void {
    this.subAgents = this.subAgents.filter((a) => a.id !== subAgentId);
    subAgentRegistry.removeSubAgent(subAgentId);
  }

  /**
   * Get all SubAgents
   */
  getSubAgents(): SubAgent[] {
    return this.subAgents;
  }

  /**
   * Get enabled SubAgents
   */
  getEnabledSubAgents(): SubAgent[] {
    return this.subAgents.filter((a) => a.enabled);
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
  async execute(diffs: GitDiff[], verbose = false): Promise<PipelineResult> {
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

