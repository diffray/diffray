import { isGitRepository, getAllDiffs } from "./git";
import { loadConfig } from "./config";
import {
  showConfig,
  initConfig,
  resetConfigCommand,
  setConfigValue,
  getConfigValue,
  editConfig,
} from "./commands/config";
import {
  listAgents,
  showAgent,
  enableAgent,
  disableAgent,
  syncAgents,
  setAgentOrder,
} from "./commands/agents";
import {
  listExecutors,
  showExecutor,
  enableExecutor,
  disableExecutor,
  syncExecutors,
} from "./commands/executors";
import {
  listMCPServers,
  addMCPServer,
  removeMCPServer,
  enableMCPServer,
  disableMCPServer,
  setMCPEnv,
  showMCPServer,
} from "./commands/mcp";
import {
  listRules,
  showRule,
  addNewRule,
  removeRuleCommand,
  updateRulePattern,
  updateRuleAgent,
  updateRulePrompt,
  testRule,
} from "./commands/rules";
import { Pipeline } from "./pipeline";
import { loadSubAgents, loadExecutors } from "./agents";
import { log } from "./logger";
import { formatIssuesByFile, formatAsJSON } from "./issue-formatter";
import { executorFactory } from "./executors/factory";
import { subAgentRegistry } from "./subagents/registry";
import { matchPattern } from "./rules";


export async function main() {
  const args = process.argv.slice(2);

  // Check for --verbose flag
  const verboseIndex = args.indexOf("--verbose");
  const verbose = verboseIndex !== -1;
  if (verbose) {
    args.splice(verboseIndex, 1);
  }

  // Check for --json flag
  const jsonIndex = args.indexOf("--json");
  const jsonOutput = jsonIndex !== -1;
  if (jsonOutput) {
    args.splice(jsonIndex, 1);
  }

  // Check for --severity flag
  const severityIndex = args.findIndex((arg) => arg.startsWith("--severity="));
  let severityFilter: string[] | undefined;
  if (severityIndex !== -1) {
    const severityArg = args[severityIndex];
    const severityValue = severityArg?.split("=")[1]?.trim();
    if (severityValue && severityValue.length > 0) {
      severityFilter = severityValue.split(",").map((s) => s.trim());
    }
    args.splice(severityIndex, 1);
  }

  const command = args[0];

  // Handle config commands
  if (command === "config") {
    const subcommand = args[1];

    switch (subcommand) {
      case "show":
        await showConfig();
        return;
      case "init":
        await initConfig();
        return;
      case "reset":
        await resetConfigCommand();
        return;
      case "set":
        if (args.length < 4 || !args[2] || !args[3]) {
          log.error("Usage: diffray config set <key> <value>");
          process.exit(1);
        }
        await setConfigValue(args[2], args[3]);
        return;
      case "get":
        if (args.length < 3 || !args[2]) {
          log.error("Usage: diffray config get <key>");
          process.exit(1);
        }
        await getConfigValue(args[2]);
        return;
      case "edit":
        await editConfig();
        return;
      default:
        log.plain("📋 diffray Configuration Commands\n");
        log.plain("Usage: diffray config <command>\n");
        log.plain("Commands:");
        log.plain("  show              Show current configuration");
        log.plain("  init              Initialize configuration file");
        log.plain("  reset             Reset to default configuration");
        log.plain("  set <key> <value> Set a configuration value");
        log.plain("  get <key>         Get a configuration value");
        log.plain("  edit              Edit configuration in $EDITOR");
        log.plain("\nExample:");
        log.plain("  diffray config set ai.provider openai");
        log.plain("  diffray config get ai.provider");
        return;
    }
  }

  // Handle agents commands
  if (command === "agents") {
    const subcommand = args[1];

    switch (subcommand) {
      case "list":
        await listAgents();
        return;
      case "show":
        if (args.length < 3 || !args[2]) {
          log.error("Usage: diffray agents show <agent-id>");
          process.exit(1);
        }
        await showAgent(args[2]);
        return;
      case "enable":
        if (args.length < 3 || !args[2]) {
          log.error("Usage: diffray agents enable <agent-id>");
          process.exit(1);
        }
        await enableAgent(args[2]);
        return;
      case "disable":
        if (args.length < 3 || !args[2]) {
          log.error("Usage: diffray agents disable <agent-id>");
          process.exit(1);
        }
        await disableAgent(args[2]);
        return;
      case "sync":
        await syncAgents();
        return;
      case "order":
        if (args.length < 4 || !args[2] || !args[3]) {
          log.error("Usage: diffray agents order <agent-id> <order>");
          process.exit(1);
        }
        await setAgentOrder(args[2], parseInt(args[3]));
        return;
      default:
        log.plain("🤖 diffray Agent Commands\n");
        log.plain("Usage: diffray agents <command>\n");
        log.plain("Commands:");
        log.plain("  list                    List all agents");
        log.plain("  show <id>               Show agent details");
        log.plain("  enable <id>             Enable an agent");
        log.plain("  disable <id>            Disable an agent");
        log.plain("  sync                    Sync agents from backend");
        log.plain("  order <id> <number>     Set agent execution order");
        log.plain("\nExample:");
        log.plain("  diffray agents list");
        log.plain("  diffray agents enable code-review");
        return;
    }
  }

  // Handle executors commands
  if (command === "executors") {
    const subcommand = args[1];

    switch (subcommand) {
      case "list":
        await listExecutors();
        return;
      case "show":
        if (args.length < 3 || !args[2]) {
          log.error("Usage: diffray executors show <executor-id>");
          process.exit(1);
        }
        await showExecutor(args[2]);
        return;
      case "enable":
        if (args.length < 3 || !args[2]) {
          log.error("Usage: diffray executors enable <executor-id>");
          process.exit(1);
        }
        await enableExecutor(args[2]);
        return;
      case "disable":
        if (args.length < 3 || !args[2]) {
          log.error("Usage: diffray executors disable <executor-id>");
          process.exit(1);
        }
        await disableExecutor(args[2]);
        return;
      case "sync":
        await syncExecutors();
        return;
      default:
        log.plain("⚙️  diffray Executor Commands\n");
        log.plain("Usage: diffray executors <command>\n");
        log.plain("Commands:");
        log.plain("  list                    List all executors");
        log.plain("  show <id>               Show executor details");
        log.plain("  enable <id>             Enable an executor");
        log.plain("  disable <id>            Disable an executor");
        log.plain("  sync                    Sync executors from backend");
        log.plain("\nExample:");
        log.plain("  diffray executors list");
        log.plain("  diffray executors enable claude-api");
        log.plain("  diffray executors disable auggie-cli");
        return;
    }
  }

  // Handle MCP commands
  if (command === "mcp") {
    const subcommand = args[1];

    switch (subcommand) {
      case "list":
        await listMCPServers();
        return;
      case "add": {
        const name = args[2];
        const cmd = args[3];
        const cmdArgs = args.slice(4);
        if (!name || !cmd) {
          log.error("Usage: diffray mcp add <name> <command> [args...]");
          process.exit(1);
        }
        await addMCPServer(name, cmd, cmdArgs);
        return;
      }
      case "remove": {
        const name = args[2];
        if (!name) {
          log.error("Usage: diffray mcp remove <name>");
          process.exit(1);
        }
        await removeMCPServer(name);
        return;
      }
      case "enable": {
        const name = args[2];
        if (!name) {
          log.error("Usage: diffray mcp enable <name>");
          process.exit(1);
        }
        await enableMCPServer(name);
        return;
      }
      case "disable": {
        const name = args[2];
        if (!name) {
          log.error("Usage: diffray mcp disable <name>");
          process.exit(1);
        }
        await disableMCPServer(name);
        return;
      }
      case "env": {
        const name = args[2];
        const key = args[3];
        const value = args[4];
        if (!name || !key || !value) {
          log.error("Usage: diffray mcp env <name> <key> <value>");
          process.exit(1);
        }
        await setMCPEnv(name, key, value);
        return;
      }
      case "show": {
        const name = args[2];
        if (!name) {
          log.error("Usage: diffray mcp show <name>");
          process.exit(1);
        }
        await showMCPServer(name);
        return;
      }
      default:
        log.robot("diffray MCP Commands");
        log.newline();
        log.plain("Commands:");
        log.plain("  list                    List all MCP servers");
        log.plain("  add <name> <cmd> [args] Add MCP server");
        log.plain("  remove <name>           Remove MCP server");
        log.plain("  show <name>             Show MCP server details");
        log.plain("  enable <name>           Enable MCP server");
        log.plain("  disable <name>          Disable MCP server");
        log.plain("  env <name> <key> <val>  Set environment variable");
        log.newline();
        log.plain("Examples:");
        log.plain("  diffray mcp list");
        log.plain("  diffray mcp add fs npx -y @modelcontextprotocol/server-filesystem /tmp");
        log.plain("  diffray mcp env fs API_KEY secret123");
        log.plain("  diffray mcp enable fs");
        return;
    }
  }

  // Handle rules commands
  if (command === "rules") {
    const subcommand = args[1];

    switch (subcommand) {
      case "list":
        await listRules();
        return;
      case "show":
        if (args.length < 3 || !args[2]) {
          log.error("Usage: diffray rules show <rule-id>");
          process.exit(1);
        }
        await showRule(args[2]);
        return;
      case "add":
        if (args.length < 7 || !args[2] || !args[3] || !args[4] || !args[5] || !args[6]) {
          log.error('Usage: diffray rules add <id> <name> <patterns> <agent> <prompt>');
          log.plain('  patterns: comma-separated glob patterns (e.g., "**/*.ts,**/*.tsx")');
          log.plain('  prompt: what to check for (e.g., "Check for type safety issues")');
          process.exit(1);
        }
        await addNewRule(args[2], args[3], args[4], args[5], args[6]);
        return;
      case "remove":
        if (args.length < 3 || !args[2]) {
          log.error("Usage: diffray rules remove <rule-id>");
          process.exit(1);
        }
        await removeRuleCommand(args[2]);
        return;
      case "pattern":
        if (args.length < 4 || !args[2] || !args[3]) {
          log.error("Usage: diffray rules pattern <rule-id> <pattern>");
          process.exit(1);
        }
        await updateRulePattern(args[2], args[3]);
        return;
      case "agent":
        if (args.length < 4 || !args[2] || !args[3]) {
          log.error("Usage: diffray rules agent <rule-id> <agent>");
          process.exit(1);
        }
        await updateRuleAgent(args[2], args[3]);
        return;
      case "prompt":
        if (args.length < 4 || !args[2] || !args[3]) {
          log.error("Usage: diffray rules prompt <rule-id> <prompt>");
          process.exit(1);
        }
        await updateRulePrompt(args[2], args[3]);
        return;
      case "test":
        if (args.length < 4 || !args[2]) {
          log.error("Usage: diffray rules test <rule-id> <file1> [file2...]");
          process.exit(1);
        }
        await testRule(args[2], args.slice(3));
        return;
      default:
        log.plain("📋 diffray Rules Commands\n");
        log.plain("Usage: diffray rules <command>\n");
        log.plain("Commands:");
        log.plain("  list                                    List all rules");
        log.plain("  show <id>                               Show rule details");
        log.plain("  add <id> <name> <patterns> <agent> <prompt>  Add new rule");
        log.plain("  remove <id>                             Remove rule");
        log.plain("  pattern <id> <patterns>                 Update rule patterns (comma-separated)");
        log.plain("  agent <id> <agent>                      Update rule agent");
        log.plain("  prompt <id> <prompt>                    Update rule prompt (what to check)");
        log.plain("  test <id> <files...>                    Test rule matching");
        log.plain("\nExamples:");
        log.plain('  diffray rules add ts-review "TypeScript Review" "**/*.ts,**/*.tsx" code-review "Check for type safety"');
        log.plain('  diffray rules pattern ts-review "src/**/*.ts,src/**/*.tsx"');
        log.plain('  diffray rules agent ts-review security-scan');
        log.plain('  diffray rules prompt ts-review "Focus on type safety and null checks"');
        log.plain('  diffray rules test ts-review src/index.ts src/cli.ts');
        return;
    }
  }

  // Handle help command
  if (command === "help" || command === "--help" || command === "-h") {
    showHelp();
    return;
  }

  // Default: run code review
  await runReview(verbose, jsonOutput, severityFilter);
}

function getStatusIcon(status: string): string {
  switch (status) {
    case "modified":
      return "📝";
    case "added":
      return "➕";
    case "deleted":
      return "🗑️";
    case "renamed":
      return "📋";
    default:
      return "📄";
  }
}

async function runReview(verbose = false, jsonOutput = false, severityFilter?: string[]) {
  if (!jsonOutput) {
    log.lightning("diffray - AI Code Review Pipeline");
    log.newline();
  }

  const config = await loadConfig();

  const isRepo = await isGitRepository();
  if (!isRepo) {
    if (!jsonOutput) {
      log.error("Not a git repository");
    }
    process.exit(1);
  }

  if (!jsonOutput) {
    log.chart("Analyzing changes...");
  }
  const diffs = await getAllDiffs();

  if (diffs.length === 0) {
    log.success("No changes");
    return;
  }

  const filteredDiffs = diffs.filter((diff) => {
    return !config.review.excludePatterns.some((pattern) => {
      return matchPattern(diff.file, pattern);
    });
  });

  if (filteredDiffs.length === 0) {
    log.success("No changes (all excluded)");
    return;
  }

  // Calculate statistics
  const totalAdditions = filteredDiffs.reduce((sum, d) => sum + d.additions, 0);
  const totalDeletions = filteredDiffs.reduce((sum, d) => sum + d.deletions, 0);
  const totalChanges = totalAdditions + totalDeletions;

  // Count by status
  const statusCounts = filteredDiffs.reduce((acc, d) => {
    acc[d.status] = (acc[d.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Display summary (skip in JSON mode)
  if (!jsonOutput) {
    const statusParts: string[] = [];
    if (statusCounts.modified) statusParts.push(`${statusCounts.modified} modified`);
    if (statusCounts.added) statusParts.push(`${statusCounts.added} added`);
    if (statusCounts.deleted) statusParts.push(`${statusCounts.deleted} deleted`);
    if (statusCounts.renamed) statusParts.push(`${statusCounts.renamed} renamed`);

    log.file(`${filteredDiffs.length} files: ${statusParts.join(", ")}`);
    log.plain(`   ${totalChanges} changes: +${totalAdditions} -${totalDeletions}`);

    // Show detailed file list if verbose or few files
    const showFiles = verbose || filteredDiffs.length <= 5;
    if (showFiles) {
      log.newline();
      for (const diff of filteredDiffs) {
        const statusIcon = getStatusIcon(diff.status);
        log.plain(`   ${statusIcon} ${diff.file}: +${diff.additions} -${diff.deletions}`);
      }
    }
    log.newline();

    log.robot("Loading executors and SubAgents...");
  }

  // Load and register executors
  const executors = await loadExecutors();
  const enabledExecutors = executors.filter((e) => e.enabled);
  for (const executor of enabledExecutors) {
    executorFactory.registerExecutor(executor);
  }
  if (!jsonOutput) {
    log.success(`Loaded ${enabledExecutors.length} executor(s)`);
  }

  // Load and register SubAgents
  const subAgents = await loadSubAgents();
  const enabledSubAgents = subAgents.filter((a) => a.enabled);
  for (const subAgent of enabledSubAgents) {
    subAgentRegistry.registerSubAgent(subAgent);
  }
  if (!jsonOutput) {
    log.success(`Loaded ${enabledSubAgents.length} SubAgent(s)`);
    log.newline();
  }

  const pipeline = new Pipeline(subAgents, executors);
  const result = await pipeline.execute(filteredDiffs, verbose, jsonOutput);

  const issuesFromResults = result.context.results.flatMap((r) => r.issues);

  // Apply severity filter if specified
  let filteredIssues = issuesFromResults;
  if (severityFilter && severityFilter.length > 0) {
    filteredIssues = issuesFromResults.filter((issue) =>
      severityFilter.includes(issue.severity)
    );
  }

  // Output results based on format
  if (jsonOutput) {
    // JSON output for machine consumption
    const successCount = result.context.results.filter((r) => r.success).length;
    const json = formatAsJSON(
      filteredIssues,
      result.success,
      result.totalDuration,
      result.context.results.length,
      successCount,
      filteredDiffs.length
    );
    console.log(json);
  } else {
    // Human-readable output
    log.separator();
    if (result.success) {
      log.success(`Pipeline completed successfully in ${result.totalDuration}ms`);
    } else {
      log.warn(`Pipeline completed with errors in ${result.totalDuration}ms`);
    }

    const successCount = result.context.results.filter((r) => r.success).length;
    log.chart(`${successCount}/${result.context.results.length} agents succeeded`);

    // Show severity filter info if applied
    if (severityFilter && severityFilter.length > 0) {
      const severityList = severityFilter.join(", ");
      log.info(`Filtering by severity: ${severityList}`);
    }

    // Show issue statistics
    if (filteredIssues.length > 0) {
      const errorCount = filteredIssues.filter((i) => i.severity === "error").length;
      const warningCount = filteredIssues.filter((i) => i.severity === "warning").length;
      const infoCount = filteredIssues.filter((i) => i.severity === "info").length;
      const suggestionCount = filteredIssues.filter((i) => i.severity === "suggestion").length;

      const parts: string[] = [];
      if (errorCount > 0) parts.push(`${errorCount} error(s)`);
      if (warningCount > 0) parts.push(`${warningCount} warning(s)`);
      if (infoCount > 0) parts.push(`${infoCount} info`);
      if (suggestionCount > 0) parts.push(`${suggestionCount} suggestion(s)`);

      log.chart(`${filteredIssues.length} issue(s): ${parts.join(", ")}`);

      // Display all issues
      log.newline();
      console.log(formatIssuesByFile(filteredIssues));
    } else {
      // No issues found - show congratulations message
      log.newline();
      if (severityFilter && severityFilter.length > 0) {
        const severityList = severityFilter.join(", ");
        log.success(`🎉 Congrats! No ${severityList} issues found`);
      } else {
        log.success("🎉 Congrats! No issues found");
      }
    }

    log.newline();
  }
}

function showHelp() {
  log.lightning("diffray - AI Code Review Pipeline");
  log.newline();
  log.plain("Usage: diffray [command] [options]");
  log.newline();
  log.plain("Commands:");
  log.plain("  (no command)      Run code review pipeline on current git changes");
  log.plain("  agents <cmd>      Manage agents");
  log.plain("  executors <cmd>   Manage executors");
  log.plain("  rules <cmd>       Manage matching rules");
  log.plain("  config <cmd>      Manage configuration");
  log.plain("  mcp <cmd>         Manage MCP servers");
  log.plain("  help              Show this help message");
  log.newline();
  log.plain("Options:");
  log.plain("  --verbose                  Show agent prompts and detailed information");
  log.plain("  --json                     Output results in JSON format");
  log.plain("  --severity=<types>         Filter issues by severity (comma-separated)");
  log.plain("                             Valid values: error, warning, info, suggestion");
  log.newline();
  log.plain("Environment Variables:");
  log.plain("  VERBOSE=1                  Show detailed file list");
  log.plain("  DEBUG=1                    Show debug messages");
  log.newline();
  log.plain("Examples:");
  log.plain("  diffray                              # Run review pipeline");
  log.plain("  diffray --verbose                    # Run with prompts");
  log.plain("  diffray --json                       # Output JSON");
  log.plain("  diffray --severity=error             # Show only errors");
  log.plain("  diffray --severity=error,warning     # Show errors and warnings");
  log.plain("  VERBOSE=1 diffray                    # Run with file details");
  log.plain("  diffray agents list                  # List all agents");
  log.plain("  diffray executors list               # List all executors");
  log.plain("  diffray rules list                   # List all rules");
  log.plain("  diffray config show                  # Show configuration");
  log.plain("  diffray mcp list                     # List MCP servers");
}
