/* eslint-disable no-console */
/**
 * Centralized logging - maximally fast and simple
 */

import { homedir } from 'node:os';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

const activeSpinners = new Set<Spinner>();

function restoreCursor() {
  process.stdout.write('\x1B[?25h');
}

process.on('SIGINT', () => {
  for (const spinner of activeSpinners) {
    spinner.stop();
  }
  restoreCursor();
  console.log(`\n${colors.yellow}!${colors.reset} Interrupted - shutting down gracefully`);
  process.exit(130);
});

process.on('SIGTERM', () => {
  for (const spinner of activeSpinners) {
    spinner.stop();
  }
  restoreCursor();
  console.log(`\n${colors.yellow}!${colors.reset} Terminated - shutting down gracefully`);
  process.exit(143);
});

/**
 * Fast logger using Bun's console
 */
export const log = {
  // Success messages
  success: (msg: string) => {
    console.log(`${colors.green}✓${colors.reset} ${msg}`);
  },

  // Error messages
  error: (msg: string, error?: unknown) => {
    const errorMsg = error ? `${msg} ${error}` : msg;
    console.error(`${colors.red}✗${colors.reset} ${errorMsg}`);
  },

  // Warning messages
  warn: (msg: string, error?: unknown) => {
    const warnMsg = error ? `${msg} ${error}` : msg;
    console.warn(`${colors.yellow}!${colors.reset} ${warnMsg}`);
  },

  // Info messages
  info: (msg: string) => {
    console.log(`${colors.blue}○${colors.reset} ${msg}`);
  },

  // Debug messages (only in verbose mode)
  debug: (msg: string) => {
    if (process.env.DEBUG) {
      console.log(`${colors.gray}·${colors.reset} ${msg}`);
    }
  },

  // Plain messages
  plain: (msg: string) => {
    console.log(msg);
  },

  // Semantic log methods for pipeline stages
  load: (msg: string) => console.log(`${colors.cyan}▸${colors.reset} ${msg}`),
  match: (msg: string) => console.log(`${colors.magenta}◆${colors.reset} ${msg}`),
  execute: (msg: string) => console.log(`${colors.blue}›${colors.reset} ${msg}`),
  agent: (msg: string) => console.log(`${colors.cyan}◉${colors.reset} ${msg}`),
  done: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),

  // Semantic log methods for CLI
  analyze: (msg: string) => console.log(`${colors.blue}○${colors.reset} ${msg}`),
  run: (msg: string) => console.log(`${colors.green}▶${colors.reset} ${msg}`),
  stats: (msg: string) => console.log(`   ${msg}`),

  // Emoji messages
  rocket: (msg: string) => console.log(`${colors.magenta}▲${colors.reset} ${msg}`),
  robot: (msg: string) => console.log(`${colors.cyan}◉${colors.reset} ${msg}`),
  chart: (msg: string) => console.log(`${colors.blue}■${colors.reset} ${msg}`),
  file: (msg: string) => console.log(`${colors.gray}◇${colors.reset} ${msg}`),
  sync: (msg: string) => console.log(`${colors.cyan}↻${colors.reset} ${msg}`),
  lightning: (msg: string) => console.log(`${colors.yellow}⚡${colors.reset} ${msg}`),
  sparkles: (msg: string) => console.log(`${colors.magenta}✦${colors.reset} ${msg}`),

  // Logo banner
  logo: () => {
    console.log(`
 ██████╗  ██╗ ███████╗ ███████╗ ██████╗   █████╗  ██╗   ██╗
 ██╔══██╗ ██║ ██╔════╝ ██╔════╝ ██╔══██╗ ██╔══██╗ ╚██╗ ██╔╝
 ██║  ██║ ██║ █████╗   █████╗   ██████╔╝ ███████║  ╚████╔╝   ${colors.bold}Multi-agent code review${colors.reset}
 ██║  ██║ ██║ ██╔══╝   ██╔══╝   ██╔══██╗ ██╔══██║   ╚██╔╝
 ██████╔╝ ██║ ██║      ██║      ██║  ██║ ██║  ██║    ██║
 ╚═════╝  ╚═╝ ╚═╝      ╚═╝      ╚═╝  ╚═╝ ╚═╝  ╚═╝    ╚═╝
`);
  },

  // Separator
  separator: (char = '=', length = 80) => {
    console.log(char.repeat(length));
  },

  // Empty line
  newline: () => console.log(),
};

/**
 * Format path for display (shorten common prefixes)
 * - Replaces home directory with ~
 * - Replaces current working directory with .
 * - Preserves embedded: prefix as-is
 */
export function formatPath(path?: string): string {
  if (!path) return '-';
  if (path.startsWith('embedded:')) return path;

  const home = homedir();
  const cwd = process.cwd();

  if (path.startsWith(home)) {
    return '~' + path.slice(home.length);
  }
  if (path.startsWith(cwd)) {
    return '.' + path.slice(cwd.length);
  }
  return path;
}

/**
 * Timer for performance measurement
 */
export class Timer {
  private start: number;

  constructor() {
    this.start = performance.now();
  }

  elapsed(): number {
    return Math.round(performance.now() - this.start);
  }

  log(label: string) {
    log.debug(`${label}: ${this.elapsed()}ms`);
  }
}

/**
 * Group related logs
 */
export function group(title: string, fn: () => void | Promise<void>) {
  console.group(title);
  const result = fn();
  if (result instanceof Promise) {
    return result.finally(() => console.groupEnd());
  }
  console.groupEnd();
}

/**
 * Spinner for long-running operations
 */
export class Spinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private frameIndex = 0;
  private message: string;
  private isSpinning = false;

  constructor(message: string) {
    this.message = message;
  }

  start() {
    if (this.isSpinning) return;
    this.isSpinning = true;
    activeSpinners.add(this);
    this.frameIndex = 0;

    // Hide cursor
    process.stdout.write('\x1B[?25l');

    // Start spinning
    this.intervalId = setInterval(() => {
      const frame = this.frames[this.frameIndex];
      process.stdout.write(`\r${colors.cyan}${frame}${colors.reset} ${this.message}`);
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
    }, 80);
  }

  update(message: string) {
    this.message = message;
  }

  succeed(message?: string) {
    this.stop();
    const msg = message || this.message;
    console.log(`${colors.green}✓${colors.reset} ${msg}`);
  }

  fail(message?: string) {
    this.stop();
    const msg = message || this.message;
    console.log(`${colors.red}✗${colors.reset} ${msg}`);
  }

  warn(message?: string) {
    this.stop();
    const msg = message || this.message;
    console.log(`${colors.yellow}!${colors.reset} ${msg}`);
  }

  stop() {
    if (!this.isSpinning) return;
    activeSpinners.delete(this);
    this.isSpinning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Clear line and show cursor
    process.stdout.write('\r\x1B[K');
    process.stdout.write('\x1B[?25h');
  }
}

/**
 * Task status for MultiProgress
 */
export type TaskStatus = 'pending' | 'running' | 'done' | 'error';

/**
 * Task configuration for MultiProgress
 */
export interface ProgressTask {
  id: string;
  label: string;
  status: TaskStatus;
  detail?: string;
  duration?: number;
  startTime?: number;
  // For ETA calculation
  totalBatches: number;
  completedBatches: number;
  fileCount: number;
  ruleCount: number;
}

/**
 * ETA estimation constant: average seconds per file×rule combination.
 * This is a rough heuristic - actual times vary significantly:
 * - claude-cli: ~15-30s (subprocess overhead + streaming)
 * - cerebras-api: ~5-10s (fast inference)
 * - llm-api: ~10-20s (depends on provider)
 * Value of 10s is a middle-ground estimate for smooth progress display.
 */
const SECONDS_PER_FILE_RULE = 10;

/**
 * Multi-line progress display like Docker build output
 *
 * Example:
 *   [1/2] bug-hunter       ░░░░░░░░░░░░ ⠼ 12s  ~20s left
 *   [2/2] security-scan    ████████████ ✓ 8.2s
 */
export class MultiProgress {
  private tasks: Map<string, ProgressTask> = new Map();
  private taskOrder: string[] = [];
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private frameIndex = 0;
  private linesWritten = 0;
  private isActive = false;
  private isDirty = true; // Track if state changed since last render
  private exitHandler: (() => void) | null = null;

  /**
   * Add a task to track
   * @param id - Unique task ID
   * @param label - Display label
   * @param totalBatches - Number of batches
   * @param fileCount - Number of files (for ETA)
   * @param ruleCount - Number of rules (for ETA)
   * @param detail - Additional detail text
   */
  addTask(
    id: string,
    label: string,
    totalBatches: number,
    fileCount: number,
    ruleCount: number,
    detail?: string
  ): void {
    const task: ProgressTask = {
      id,
      label,
      status: 'pending',
      detail,
      totalBatches,
      completedBatches: 0,
      fileCount,
      ruleCount,
    };
    this.tasks.set(id, task);
    this.taskOrder.push(id);
  }

  /**
   * Start the multi-progress display
   */
  start(): void {
    if (this.isActive) return;
    this.isActive = true;

    // Hide cursor
    process.stdout.write('\x1B[?25l');

    // Register exit handler to restore cursor on unexpected termination
    this.exitHandler = () => {
      process.stdout.write('\x1B[?25h');
    };
    process.on('exit', this.exitHandler);

    // Initial render
    this.render();

    // Start animation loop
    this.intervalId = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
      // Only render if dirty or if there are running tasks (for spinner animation)
      const hasRunning = [...this.tasks.values()].some((t) => t.status === 'running');
      if (this.isDirty || hasRunning) {
        this.render();
        this.isDirty = false;
      }
    }, 80);
  }

  /**
   * Mark task as running
   */
  startTask(id: string): void {
    const task = this.tasks.get(id);
    if (!task) return;
    if (task.status !== 'running') {
      task.startTime = Date.now();
      task.status = 'running';
      this.isDirty = true;
    }
  }

  /**
   * Complete a batch and update progress
   */
  completeBatch(id: string): void {
    const task = this.tasks.get(id);
    if (!task) return;

    task.completedBatches++;
    this.isDirty = true;

    // Auto-complete task when all batches done
    if (task.completedBatches >= task.totalBatches) {
      task.status = 'done';
      if (task.startTime) {
        task.duration = Date.now() - task.startTime;
      }
    }
  }

  /**
   * Mark task as error
   */
  failTask(id: string): void {
    const task = this.tasks.get(id);
    if (!task) return;
    task.status = 'error';
    this.isDirty = true;
    if (task.startTime) {
      task.duration = Date.now() - task.startTime;
    }
  }

  /**
   * Calculate estimated total time based on file/rule count
   */
  private getEstimatedTotal(task: ProgressTask): number {
    return task.fileCount * task.ruleCount * SECONDS_PER_FILE_RULE * 1000;
  }

  /**
   * Calculate progress (0-1) combining time-based and batch-based progress.
   * Uses the maximum of both to ensure smooth animation while respecting
   * actual completion - if task finishes faster than estimated, batch progress
   * will drive the bar forward; if slower, time progress keeps it moving.
   */
  private calculateProgress(task: ProgressTask): number {
    if (task.status === 'done') return 1;
    if (task.status === 'error') return task.completedBatches / Math.max(1, task.totalBatches);
    if (task.status !== 'running' || !task.startTime) return 0;

    // Time-based progress (smooth animation)
    const elapsed = Date.now() - task.startTime;
    const estimatedTotal = this.getEstimatedTotal(task);
    const timeProgress = elapsed / estimatedTotal;

    // Batch-based progress (actual completion)
    const batchProgress = task.completedBatches / Math.max(1, task.totalBatches);

    // Use max of both, capped at 95% until actually done
    return Math.min(0.95, Math.max(timeProgress, batchProgress));
  }

  /**
   * Calculate remaining time
   */
  private calculateETA(task: ProgressTask): number | null {
    if (task.status !== 'running' || !task.startTime) return null;

    const elapsed = Date.now() - task.startTime;
    const estimatedTotal = this.getEstimatedTotal(task);
    const remaining = Math.max(0, estimatedTotal - elapsed);

    return remaining > 1000 ? remaining : null;
  }

  /**
   * Format progress bar from 0-1 progress value
   */
  private formatProgressBar(progress: number, width: number = 40): string {
    const filled = Math.round(progress * width);
    const empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  /**
   * Render all task lines
   */
  private render(): void {
    // Move cursor up to overwrite previous output
    if (this.linesWritten > 0) {
      process.stdout.write(`\x1B[${this.linesWritten}A`);
    }

    const lines: string[] = [];
    const total = this.taskOrder.length;

    for (let i = 0; i < this.taskOrder.length; i++) {
      const id = this.taskOrder[i]!;
      const task = this.tasks.get(id);
      if (!task) continue;
      const taskLines = this.formatTaskLine(task, i + 1, total);
      lines.push(...taskLines);
    }

    // Write all lines
    for (const line of lines) {
      process.stdout.write(`\x1B[K${line}\n`);
    }

    this.linesWritten = lines.length;
  }

  /**
   * Format a single task line (returns 2 lines: progress + detail)
   */
  private formatTaskLine(task: ProgressTask, index: number, total: number): string[] {
    const indexStr = `[${index}/${total}]`.padEnd(7);
    // No label width limit - let it take full width

    // Progress bar with status
    let barColor: string;
    let statusIcon: string;

    switch (task.status) {
      case 'pending':
        barColor = colors.gray;
        statusIcon = '○';
        break;
      case 'running':
        barColor = colors.cyan;
        statusIcon = this.frames[this.frameIndex] ?? '⠋';
        break;
      case 'done':
        barColor = colors.green;
        statusIcon = '✓';
        break;
      case 'error':
        barColor = colors.red;
        statusIcon = '✗';
        break;
    }

    // Use time-based progress for smooth animation
    const progress = this.calculateProgress(task);
    const bar = this.formatProgressBar(progress);
    const progressStr = `${barColor}${bar}${colors.reset} ${statusIcon}`;

    // Format time - show only one value: ETA while running, elapsed when done
    let timeStr = '';
    if (task.status === 'running') {
      const eta = this.calculateETA(task);
      if (eta !== null) {
        const etaSec = Math.ceil(eta / 1000);
        timeStr = `~${etaSec}s`;
      }
    } else if (task.duration !== undefined) {
      const sec = (task.duration / 1000).toFixed(1);
      timeStr = `${sec}s`;
    }

    // Line 1: Task label with details (only if running or done)
    const detailStr =
      task.detail && task.status !== 'pending'
        ? ` ${colors.dim}| ${task.detail}${colors.reset}`
        : '';
    const line1 = `  ${colors.dim}${indexStr}${colors.reset} ${task.label}${detailStr}`;

    // Line 2: Progress bar and time only - indented to align with line 1
    const line2 = `         ${progressStr} ${timeStr.padEnd(6)}`;

    return [line1, line2];
  }

  /**
   * Stop the multi-progress display
   */
  stop(): void {
    if (!this.isActive) return;
    this.isActive = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Remove exit handler
    if (this.exitHandler) {
      process.removeListener('exit', this.exitHandler);
      this.exitHandler = null;
    }

    // Final render
    this.render();

    // Show cursor
    process.stdout.write('\x1B[?25h');
  }
}
