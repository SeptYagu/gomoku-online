/**
 * AI Web Worker Reuse Pool
 *
 * Keeps worker instances alive across turns to avoid the overhead of re-evaluating
 * scripts, re-initializing Zobrist hash tables, and allocating worker threads.
 * If a search is cancelled mid-flight (e.g. undo, reset, timeout), busy workers
 * are terminated and fresh instances are created lazily.
 */

export type WorkerFactory = () => Worker;

export function defaultAiWorkerFactory(): Worker {
  return new Worker(new URL("./ai-worker.ts", import.meta.url), {
    type: "module"
  });
}

export class AiWorkerPool {
  private idleWorkers: Worker[] = [];
  private busyWorkers: Set<Worker> = new Set();
  private createWorker: WorkerFactory;

  constructor(createWorker: WorkerFactory = defaultAiWorkerFactory) {
    this.createWorker = createWorker;
  }

  /**
   * Acquire `count` workers for a calculation session.
   * Reuses available idle workers, spawning new ones up to `count`.
   */
  acquire(count: number): Worker[] {
    const acquired: Worker[] = [];

    while (acquired.length < count) {
      const worker = this.idleWorkers.pop() ?? this.createWorker();
      this.busyWorkers.add(worker);
      acquired.push(worker);
    }

    return acquired;
  }

  /**
   * Return a worker to the idle pool once it has cleanly finished its work.
   */
  release(worker: Worker): void {
    if (!this.busyWorkers.has(worker)) {
      return;
    }

    worker.onmessage = null;
    worker.onerror = null;
    this.busyWorkers.delete(worker);
    this.idleWorkers.push(worker);
  }

  /**
   * Release multiple workers that finished cleanly.
   */
  releaseAll(workers: Worker[]): void {
    for (const worker of workers) {
      this.release(worker);
    }
  }

  /**
   * Terminate workers that were interrupted while busy (e.g. user Undo/Reset),
   * removing them from the pool so they never leak execution or stale messages.
   */
  terminateBusy(workers: Worker[]): void {
    for (const worker of workers) {
      worker.onmessage = null;
      worker.onerror = null;
      this.busyWorkers.delete(worker);
      try {
        worker.terminate();
      } catch {
        // Ignore termination errors
      }
    }
  }

  /**
   * Terminate all workers in the pool (e.g. on unmount).
   */
  terminateAll(): void {
    for (const worker of [...this.busyWorkers, ...this.idleWorkers]) {
      worker.onmessage = null;
      worker.onerror = null;
      try {
        worker.terminate();
      } catch {
        // Ignore termination errors
      }
    }
    this.busyWorkers.clear();
    this.idleWorkers.length = 0;
  }

  get poolSize(): number {
    return this.idleWorkers.length + this.busyWorkers.size;
  }

  get idleCount(): number {
    return this.idleWorkers.length;
  }

  get busyCount(): number {
    return this.busyWorkers.size;
  }
}
