import type { Subprocess } from "bun";

const activeProcesses = new Set<Subprocess>();
let sigintHandlerRegistered = false;

export function trackProcess(proc: Subprocess): void {
    activeProcesses.add(proc);
    
    proc.exited.then(() => {
        activeProcesses.delete(proc);
    });
}

export async function gracefulKill(proc: Subprocess, gracePeriodMs: number = 3000): Promise<void> {
    proc.kill("SIGTERM");
    
    await Promise.race([
        proc.exited,
        new Promise<void>((resolve) => setTimeout(resolve, gracePeriodMs))
    ]);
    
    if (!proc.killed) {
        proc.kill("SIGKILL");
    }
}

export function gracefulKillSync(proc: Subprocess, gracePeriodMs: number = 3000): NodeJS.Timeout {
    proc.kill("SIGTERM");
    
    const killTimer = setTimeout(() => {
        if (!proc.killed) {
            proc.kill("SIGKILL");
        }
    }, gracePeriodMs);
    
    return killTimer;
}

export function killAllProcesses(): void {
    for (const proc of activeProcesses) {
        proc.kill("SIGTERM");
    }
    
    setTimeout(() => {
        for (const proc of activeProcesses) {
            if (!proc.killed) {
                proc.kill("SIGKILL");
            }
        }
    }, 2000);
    
    activeProcesses.clear();
}

export function ensureSigintHandler(): void {
    if (!sigintHandlerRegistered) {
        sigintHandlerRegistered = true;
        process.on("SIGINT", () => {
            killAllProcesses();
            process.exit(130);
        });
    }
}