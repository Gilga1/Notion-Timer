import fs from "fs";

/**
 * Cross-process advisory lock using exclusive create (`wx`).
 * Does NOT delete another process's lock — waits and retries instead.
 * Stale locks (process gone + older than maxAgeMs) are reclaimed.
 */
export function withFileLock<T>(
  lockPath: string,
  fn: () => T,
  opts: { maxAttempts?: number; intervalMs?: number; maxAgeMs?: number } = {},
): T {
  const maxAttempts = opts.maxAttempts ?? 50;
  const intervalMs = opts.intervalMs ?? 50;
  const maxAgeMs = opts.maxAgeMs ?? 30_000;

  acquireLock(lockPath, maxAttempts, intervalMs, maxAgeMs);
  try {
    return fn();
  } finally {
    releaseLock(lockPath);
  }
}

function sleepSync(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* busy-wait — Node has no sync sleep without Atomics; keep short */
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireLock(
  lockPath: string,
  maxAttempts: number,
  intervalMs: number,
  maxAgeMs: number,
): void {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      fs.writeFileSync(lockPath, process.pid.toString(), { flag: "wx" });
      return;
    } catch (err: any) {
      if (err.code !== "EEXIST") throw err;

      // Only reclaim if lock is stale (dead PID or too old)
      try {
        const content = fs.readFileSync(lockPath, "utf8").trim();
        const pid = parseInt(content, 10);
        const stat = fs.statSync(lockPath);
        const age = Date.now() - stat.mtimeMs;
        const stale =
          (!Number.isNaN(pid) && !isProcessAlive(pid)) || age > maxAgeMs;
        if (stale) {
          fs.unlinkSync(lockPath);
          continue; // retry immediately without sleeping
        }
      } catch {
        // lock disappeared between EEXIST and read — retry
        continue;
      }

      if (i === maxAttempts - 1) {
        throw new Error(`Could not acquire lock: ${lockPath}`);
      }
      sleepSync(intervalMs);
    }
  }
}

function releaseLock(lockPath: string): void {
  try {
    const content = fs.readFileSync(lockPath, "utf8").trim();
    if (content === process.pid.toString()) {
      fs.unlinkSync(lockPath);
    }
  } catch {
    /* already gone */
  }
}
