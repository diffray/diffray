/**
 * Centralized logging - maximally fast and simple
 */

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

/**
 * Fast logger using Bun's console
 */
export const log = {
  // Success messages
  success: (msg: string) => {
    console.log(`${colors.green}✅ ${msg}${colors.reset}`);
  },

  // Error messages
  error: (msg: string) => {
    console.error(`${colors.red}❌ ${msg}${colors.reset}`);
  },

  // Warning messages
  warn: (msg: string) => {
    console.warn(`${colors.yellow}⚠️  ${msg}${colors.reset}`);
  },

  // Info messages
  info: (msg: string) => {
    console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`);
  },

  // Debug messages (only in verbose mode)
  debug: (msg: string) => {
    if (process.env.DEBUG) {
      console.log(`${colors.gray}🔍 ${msg}${colors.reset}`);
    }
  },

  // Plain messages
  plain: (msg: string) => {
    console.log(msg);
  },

  // Emoji messages
  rocket: (msg: string) => console.log(`🚀 ${msg}`),
  robot: (msg: string) => console.log(`🤖 ${msg}`),
  chart: (msg: string) => console.log(`📊 ${msg}`),
  file: (msg: string) => console.log(`📝 ${msg}`),
  sync: (msg: string) => console.log(`🔄 ${msg}`),
  lightning: (msg: string) => console.log(`⚡ ${msg}`),
  sparkles: (msg: string) => console.log(`✨ ${msg}`),

  // Separator
  separator: (char = "=", length = 80) => {
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
  private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
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
    this.frameIndex = 0;

    // Hide cursor
    process.stdout.write("\x1B[?25l");

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
    console.log(`${colors.green}✅${colors.reset} ${msg}`);
  }

  fail(message?: string) {
    this.stop();
    const msg = message || this.message;
    console.log(`${colors.red}❌${colors.reset} ${msg}`);
  }

  warn(message?: string) {
    this.stop();
    const msg = message || this.message;
    console.log(`${colors.yellow}⚠️${colors.reset}  ${msg}`);
  }

  stop() {
    if (!this.isSpinning) return;
    this.isSpinning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Clear line and show cursor
    process.stdout.write("\r\x1B[K");
    process.stdout.write("\x1B[?25h");
  }
}

