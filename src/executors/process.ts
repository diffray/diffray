import type { ChildProcess } from 'node:child_process';

const activeProcesses = new Set<ChildProcess>();
let sigintHandlerRegistered = false;

export function trackProcess(proc: ChildProcess): void {
  activeProcesses.add(proc);

  proc.once('exit', () => {
    activeProcesses.delete(proc);
  });
}

export async function gracefulKill(
  proc: ChildProcess,
  gracePeriodMs: number = 3000
): Promise<void> {
  proc.kill('SIGTERM');

  await Promise.race([
    new Promise<void>((resolve) => proc.once('exit', () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, gracePeriodMs)),
  ]);

  if (!proc.killed) {
    proc.kill('SIGKILL');
  }
}

export function gracefulKillSync(proc: ChildProcess, gracePeriodMs: number = 3000): NodeJS.Timeout {
  proc.kill('SIGTERM');

  const killTimer = setTimeout(() => {
    if (!proc.killed) {
      proc.kill('SIGKILL');
    }
  }, gracePeriodMs);

  return killTimer;
}

export function killAllProcesses(): void {
  const processes = [...activeProcesses];
  activeProcesses.clear();

  for (const proc of processes) {
    proc.kill('SIGTERM');
  }

  setTimeout(() => {
    for (const proc of processes) {
      if (!proc.killed) {
        proc.kill('SIGKILL');
      }
    }
  }, 2000);
}

export function ensureSigintHandler(): void {
  if (!sigintHandlerRegistered) {
    sigintHandlerRegistered = true;
    process.on('SIGINT', () => {
      killAllProcesses();
      process.exit(130);
    });
  }
}
