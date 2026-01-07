/**
 * Spinner without external dependencies
 */

const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const colors = {
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m',
};

export class Spinner {
  private text: string;
  private frameIndex: number = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isSpinning: boolean = false;

  constructor(text: string) {
    this.text = text;
  }

  start(): void {
    if (this.isSpinning) return;

    this.isSpinning = true;
    this.frameIndex = 0;

    // Hide cursor
    process.stdout.write('\x1b[?25l');

    this.intervalId = setInterval(() => {
      const frame = frames[this.frameIndex];
      this.frameIndex = (this.frameIndex + 1) % frames.length;

      // Clear line and write spinner
      process.stdout.write(`\r${colors.cyan}${frame}${colors.reset} ${this.text}`);
    }, 80);
  }

  success(message?: string): void {
    this.stop();
    const text = message || this.text;
    process.stdout.write(`\r${colors.green}✓${colors.reset} ${text}\n`);
  }

  error(message?: string): void {
    this.stop();
    const text = message || this.text;
    process.stdout.write(`\r${colors.red}✗${colors.reset} ${text}\n`);
  }

  warn(message?: string): void {
    this.stop();
    const text = message || this.text;
    process.stdout.write(`\r${colors.yellow}!${colors.reset} ${text}\n`);
  }

  update(text: string): void {
    this.text = text;
  }

  private stop(): void {
    if (!this.isSpinning) return;

    this.isSpinning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Clear line and show cursor
    process.stdout.write('\r\x1b[K');
    process.stdout.write('\x1b[?25h');
  }
}

/**
 * Multi-spinner for parallel operations
 */
export class MultiSpinner {
  private spinners: Map<string, { text: string; status: 'running' | 'success' | 'error' }> =
    new Map();
  private frameIndex: number = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isRunning: boolean = false;

  add(id: string, text: string): void {
    this.spinners.set(id, { text, status: 'running' });

    if (!this.isRunning) {
      this.start();
    }
  }

  success(id: string, message?: string): void {
    const spinner = this.spinners.get(id);
    if (spinner) {
      spinner.status = 'success';
      if (message) spinner.text = message;
      this.render();
      this.checkComplete();
    }
  }

  error(id: string, message?: string): void {
    const spinner = this.spinners.get(id);
    if (spinner) {
      spinner.status = 'error';
      if (message) spinner.text = message;
      this.render();
      this.checkComplete();
    }
  }

  private start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.frameIndex = 0;

    // Hide cursor
    process.stdout.write('\x1b[?25l');

    this.intervalId = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % frames.length;
      this.render();
    }, 80);
  }

  private render(): void {
    // Move cursor up to start of spinners
    const count = this.spinners.size;
    if (count > 0) {
      process.stdout.write(`\x1b[${count}A`);
    }

    // Render each spinner
    for (const [_id, spinner] of this.spinners) {
      process.stdout.write('\r\x1b[K'); // Clear line

      if (spinner.status === 'running') {
        const frame = frames[this.frameIndex];
        process.stdout.write(`${colors.cyan}${frame}${colors.reset} ${spinner.text}\n`);
      } else if (spinner.status === 'success') {
        process.stdout.write(`${colors.green}✓${colors.reset} ${spinner.text}\n`);
      } else if (spinner.status === 'error') {
        process.stdout.write(`${colors.red}✗${colors.reset} ${spinner.text}\n`);
      }
    }
  }

  private checkComplete(): void {
    const allComplete = Array.from(this.spinners.values()).every((s) => s.status !== 'running');

    if (allComplete) {
      this.stop();
    }
  }

  private stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Show cursor
    process.stdout.write('\x1b[?25h');
  }
}
