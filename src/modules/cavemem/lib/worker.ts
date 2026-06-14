const queue: Array<() => Promise<void>> = [];
let running = false;

export function enqueueEmbedding(fn: () => Promise<void>): void {
  if (process.env["CAVEMEM_NO_AUTOSTART"]) return;
  queue.push(fn);
  if (!running) drainQueue();
}

async function drainQueue(): Promise<void> {
  running = true;
  while (queue.length > 0) {
    const task = queue.shift()!;
    try {
      await task();
    } catch {
      // best-effort
    }
  }
  running = false;
}
