/* eslint-disable no-console */
/**
 * Centralized logging - maximally fast and simple
 */

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
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
    console.log();
    console.log(`  ${colors.green}┌──────────────────────────────┐${colors.reset}`);
    console.log(`  ${colors.green}│  diffray - AI Code Review    │${colors.reset}`);
    console.log(`  ${colors.green}└──────────────────────────────┘${colors.reset}`);
    console.log();
  },

  // Separator
  separator: (char = '=', length = 80) => {
    console.log(char.repeat(length));
  },

  // Empty line
  newline: () => console.log(),
};

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
