import { defineCommand } from 'citty';
import packageJson from '../package.json';
import {
  isGitRepository,
  getAllDiffs,
  getLastCommitDiffs,
  getCommitDiffs,
  ensureAtHead,
  hasUncommittedChanges,
  checkoutRef,
  getDefaultBranch,
  branchExists,
  getCurrentBranch,
} from './git';
import { loadConfig } from './config';
import { Pipeline } from './pipeline';
import { loadAgents } from './agents';
import { loadExecutors } from './executors';
import { log } from './logger';
import { formatIssuesByFile, formatAsJSON } from './issue-formatter';
import { matchPattern } from './rules';
import { configCmd } from './cli/commands/config';
import { agentsCmd } from './cli/commands/agents';
import { executorsCmd } from './cli/commands/executors';
import { rulesCmd } from './cli/commands/rules';
import { extendsCmd } from './cli/commands/extends';
import { validateReviewArgs } from './cli-schema';
import { ZodError } from 'zod';

function getStatusIcon(status: string): string {
  switch (status) {
    case 'modified':
      return '~';
    case 'added':
      return '+';
    case 'deleted':
      return '-';
    case 'renamed':
      return '→';
    default:
      return '·';
  }
}

async function runReview(args: {
  verbose?: boolean;
  json?: boolean;
  stream?: boolean;
  severity?: string;
  base?: string;
  head?: string;
  branch?: string;
  skipValidation?: boolean;
  agent?: string;
  excludeAgent?: string;
  rule?: string;
  excludeRule?: string;
  executor?: string;
  confidence?: number;
}) {
  const {
    verbose = false,
    json = false,
    stream = false,
    severity,
    base: baseArg,
    head: headArg,
    branch,
    skipValidation = false,
    agent,
    excludeAgent,
    rule,
    excludeRule,
    executor,
    confidence,
  } = args;

  // Resolve --branch to --base and --head
  let base = baseArg;
  let head = headArg;

  if (branch !== undefined && branch !== '') {
    // --branch . = current branch, --branch <name> = specific branch
    const targetBranch = branch === '.' ? await getCurrentBranch() : branch;

    if (!targetBranch) {
      if (!json) {
        log.error('Could not determine current branch (detached HEAD?)');
        log.info('Specify branch explicitly: diffray review --branch feature-auth');
      }
      process.exit(1);
    }

    // Use explicit --base if provided, otherwise auto-detect
    const baseBranch = baseArg || (await getDefaultBranch());
    if (!baseBranch) {
      if (!json) {
        log.error('Could not detect default branch (main/master/develop)');
        log.info('Use --base explicitly: diffray review --branch --base main');
      }
      process.exit(1);
    }

    // Check if specified branch exists (skip check for '.' = current branch)
    if (branch !== '.' && !(await branchExists(branch))) {
      if (!json) {
        log.error(`Branch not found: ${branch}`);
      }
      process.exit(1);
    }

    // If target branch is same as base, just review uncommitted changes
    if (targetBranch === baseBranch) {
      if (!json) {
        log.warn(
          `Branch "${targetBranch}" is the base branch, reviewing uncommitted changes instead`
        );
      }
      // Leave base/head as undefined to trigger default behavior
    } else {
      base = baseBranch;
      head = targetBranch;
      if (!json) {
        log.info(`Reviewing "${targetBranch}" against "${baseBranch}"`);
      }
    }
  }

  const agentFilter = agent ? agent.split(',').map((a: string) => a.trim()) : undefined;
  const excludeAgents = excludeAgent
    ? excludeAgent.split(',').map((a: string) => a.trim())
    : undefined;
  const ruleFilter = rule ? rule.split(',').map((r: string) => r.trim()) : undefined;
  const excludeRules = excludeRule
    ? excludeRule.split(',').map((r: string) => r.trim())
    : undefined;
  const severityFilter = severity ? severity.split(',').map((s: string) => s.trim()) : undefined;

  if (!json) {
    log.logo();
  }

  const projectPath = process.cwd();
  const config = await loadConfig(projectPath);

  const isRepo = await isGitRepository();
  if (!isRepo) {
    if (!json) {
      log.error('Not a git repository');
    }
    process.exit(1);
  }

  if (!json) {
    log.chart('Analyzing changes...');
  }

  let diffs;
  let sourceLabel = '';

  // Track if we need to restore original branch after review
  let originalRef: string | null = null;

  // Priority: explicit base/head > uncommitted changes > last commit
  if (base) {
    // Explicit comparison mode
    const headRef = head || 'HEAD';
    if (!json) {
      log.info(`Comparing ${base}...${headRef}`);
    }

    // Ensure working directory is at head ref so CLI tools can read full files
    if (await hasUncommittedChanges()) {
      if (!json) {
        log.warn('Uncommitted changes detected - cannot checkout to head ref');
        log.info('CLI tools will only see diff context, not full files');
      }
    } else {
      const checkoutResult = await ensureAtHead(headRef);
      if (checkoutResult.checkoutNeeded) {
        originalRef = checkoutResult.originalRef;
        if (!json) {
          log.info(`Checked out to ${headRef} for full file access`);
        }
      }
    }

    diffs = await getCommitDiffs(base, headRef);
    sourceLabel = ` (${base}...${headRef})`;

    if (diffs.length === 0) {
      log.success('No changes between commits');
      // Restore original ref if we checked out
      if (originalRef) {
        await checkoutRef(originalRef);
      }
      return;
    }
  } else {
    // Default mode: uncommitted changes or last commit
    diffs = await getAllDiffs();

    if (diffs.length === 0) {
      if (!json) {
        log.info('No uncommitted changes, reviewing last commit...');
      }
      diffs = await getLastCommitDiffs();
      sourceLabel = ' (last commit)';

      if (diffs.length === 0) {
        log.success('No changes to review');
        return;
      }
    }
  }

  const filteredDiffs = diffs.filter((diff) => {
    return !config.excludePatterns.some((pattern: string) => {
      return matchPattern(diff.file, pattern);
    });
  });

  if (filteredDiffs.length === 0) {
    log.success('No changes (all excluded)');
    if (originalRef) {
      await checkoutRef(originalRef);
    }
    return;
  }

  const totalAdditions = filteredDiffs.reduce((sum, d) => sum + d.additions, 0);
  const totalDeletions = filteredDiffs.reduce((sum, d) => sum + d.deletions, 0);
  const totalChanges = totalAdditions + totalDeletions;

  const statusCounts = filteredDiffs.reduce(
    (acc, d) => {
      acc[d.status] = (acc[d.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  if (!json) {
    const statusParts: string[] = [];
    if (statusCounts.modified) statusParts.push(`${statusCounts.modified} modified`);
    if (statusCounts.added) statusParts.push(`${statusCounts.added} added`);
    if (statusCounts.deleted) statusParts.push(`${statusCounts.deleted} deleted`);
    if (statusCounts.renamed) statusParts.push(`${statusCounts.renamed} renamed`);

    log.file(`${filteredDiffs.length} files${sourceLabel}: ${statusParts.join(', ')}`);
    log.plain(`   ${totalChanges} changes: +${totalAdditions} -${totalDeletions}`);

    const showFiles = verbose || filteredDiffs.length <= 5;
    if (showFiles) {
      log.newline();
      for (const diff of filteredDiffs) {
        const statusIcon = getStatusIcon(diff.status);
        log.plain(`   ${statusIcon} ${diff.file}: +${diff.additions} -${diff.deletions}`);
      }
    }
    log.newline();

    log.robot('Loading executors and Agents...');
  }

  const executors = await loadExecutors();
  const enabledExecutors = executors.filter((e) => e.enabled);
  if (!json) {
    log.success(`Loaded ${enabledExecutors.length} executor(s)`);
  }

  // Load agents with executor override if provided (applies correct settings)
  const agents = await loadAgents({ projectPath, executorOverride: executor });

  if (executor && !json) {
    log.info(`Using executor: ${executor}`);
  }

  // Log filtering info
  if (!json) {
    if (agentFilter) log.info(`Agent filter: ${agentFilter.join(', ')}`);
    if (excludeAgents) log.info(`Excluding agents: ${excludeAgents.join(', ')}`);
    if (ruleFilter) log.info(`Rule filter: ${ruleFilter.join(', ')}`);
    if (excludeRules) log.info(`Excluding rules: ${excludeRules.join(', ')}`);
  }

  const enabledAgents = agents.filter((a) => a.enabled);
  if (!json) {
    log.success(`Loaded ${enabledAgents.length} Agent(s)`);
    log.newline();
  }

  // Pipeline handles registration and filtering internally
  const pipeline = new Pipeline(agents, executors);
  const result = await pipeline.execute(filteredDiffs, {
    verbose,
    quiet: json,
    concurrency: config.concurrency,
    skipValidation,
    stream,
    baseRef: base,
    headRef: head,
    agentFilter,
    excludeAgents,
    ruleFilter,
    excludeRules,
    minConfidence: confidence,
  });

  const issuesFromResults = result.context.results.flatMap((r) => r.issues);

  let filteredIssues = issuesFromResults;
  if (severityFilter && severityFilter.length > 0) {
    filteredIssues = issuesFromResults.filter((issue) => severityFilter.includes(issue.severity));
  }

  if (json) {
    const successCount = result.context.results.filter((r) => r.success).length;
    const jsonOutput = formatAsJSON(
      filteredIssues,
      result.success,
      result.totalDuration,
      result.context.results.length,
      successCount,
      filteredDiffs.length
    );
    // eslint-disable-next-line no-console
    console.log(jsonOutput);
  } else {
    log.separator();
    if (result.success) {
      log.success(`Pipeline completed successfully in ${result.totalDuration}ms`);
    } else {
      log.warn(`Pipeline completed with errors in ${result.totalDuration}ms`);
    }

    const successCount = result.context.results.filter((r) => r.success).length;
    log.chart(`${successCount}/${result.context.results.length} agents succeeded`);

    if (severityFilter && severityFilter.length > 0) {
      const severityList = severityFilter.join(', ');
      log.info(`Filtering by severity: ${severityList}`);
    }

    if (filteredIssues.length > 0) {
      // Single pass to count all severity types
      const counts = filteredIssues.reduce(
        (acc, i) => {
          acc[i.severity] = (acc[i.severity] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      const parts: string[] = [];
      if (counts.critical) parts.push(`${counts.critical} critical`);
      if (counts.high) parts.push(`${counts.high} high`);
      if (counts.medium) parts.push(`${counts.medium} medium`);
      if (counts.low) parts.push(`${counts.low} low`);

      log.chart(`${filteredIssues.length} issue(s): ${parts.join(', ')}`);

      log.newline();
      // eslint-disable-next-line no-console
      console.log(formatIssuesByFile(filteredIssues));
    } else {
      log.newline();
      if (severityFilter && severityFilter.length > 0) {
        const severityList = severityFilter.join(', ');
        log.success(`No ${severityList} issues found 🎉`);
      } else {
        log.success('No issues found 🎉');
      }
    }

    log.newline();
  }

  // Restore original branch if we checked out
  if (originalRef) {
    await checkoutRef(originalRef);
    if (!json) {
      log.info(`Restored to ${originalRef}`);
    }
  }
}

const reviewCmd = defineCommand({
  meta: {
    name: 'review',
    description: `Run code review on current changes

Examples:
  diffray review                        Review uncommitted changes
  diffray review --branch .             Current branch vs main (auto-detect)
  diffray review --branch feature-auth  Specific branch vs main
  diffray review --branch . --base dev  Current branch vs dev
  diffray review --base main            Compare HEAD to main
  diffray review --agent general        Run only general agent
  diffray review --exclude-agent security-scan  Exclude specific agent
  diffray review --severity critical,high
  diffray review --stream               Show thinking and tool usage`,
  },
  args: {
    stream: {
      type: 'boolean',
      description: 'Show streaming output (thinking, tools, preliminary issues)',
    },
    verbose: {
      type: 'boolean',
      description: 'Show raw JSON stream',
    },
    json: {
      type: 'boolean',
      description: 'Output results in JSON format',
    },
    severity: {
      type: 'string',
      description: 'Filter issues by severity (comma-separated: critical,high,medium,low)',
    },
    base: {
      type: 'string',
      description: 'Base commit/branch to compare from (e.g., main, HEAD~3)',
    },
    head: {
      type: 'string',
      description: 'Head commit/branch to compare to (default: HEAD)',
    },
    branch: {
      type: 'string',
      description: 'Review branch vs base (auto-detects main). Use "." for current branch.',
    },
    'skip-validation': {
      type: 'boolean',
      description: 'Skip validation stage (show all issues without filtering)',
    },
    agent: {
      type: 'string',
      description: 'Run only specific agents (comma-separated: bug-hunter,security-scan)',
    },
    'exclude-agent': {
      type: 'string',
      description: 'Exclude specific agents (comma-separated)',
    },
    rule: {
      type: 'string',
      description: 'Run only specific rules (comma-separated: code-security,code-bugs)',
    },
    'exclude-rule': {
      type: 'string',
      description: 'Exclude specific rules (comma-separated)',
    },
    executor: {
      type: 'string',
      description: 'Override executor for all agents (e.g., cursor-agent-cli, claude-cli)',
    },
    confidence: {
      type: 'string',
      description:
        'Minimum confidence threshold 0-100 (default: 80). Issues below this are filtered out.',
    },
  },
  run: async ({ args }) => {
    // Validate CLI arguments with Zod
    try {
      const validatedArgs = validateReviewArgs(args);

      await runReview({
        verbose: validatedArgs.verbose,
        json: validatedArgs.json,
        stream: validatedArgs.stream,
        severity: validatedArgs.severity?.join(','), // Convert back to comma-separated string for runReview
        base: validatedArgs.base,
        head: validatedArgs.head,
        branch: validatedArgs.branch,
        skipValidation: validatedArgs['skip-validation'],
        agent: validatedArgs.agent,
        excludeAgent: validatedArgs['exclude-agent'],
        rule: validatedArgs.rule,
        excludeRule: validatedArgs['exclude-rule'],
        executor: validatedArgs.executor,
        confidence: validatedArgs.confidence,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        // Extract first error message from Zod
        const firstError = error.errors[0];
        const message = firstError?.message || 'Invalid argument';

        if (!args.json) {
          log.error(message);
        } else {
          console.error(JSON.stringify({ error: message }));
        }
        process.exit(1);
      }
      throw error;
    }
  },
});

export const main = defineCommand({
  meta: {
    name: 'diffray',
    version: packageJson.version,
    description: 'AI-powered code review CLI',
  },
  subCommands: {
    review: reviewCmd,
    config: configCmd,
    agents: agentsCmd,
    executors: executorsCmd,
    rules: rulesCmd,
    extends: extendsCmd,
  },
});
