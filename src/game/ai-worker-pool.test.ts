import { describe, expect, it, vi } from "vitest";
import { AiWorkerPool } from "./ai-worker-pool";

function createMockWorker(): Worker {
  return {
    terminate: vi.fn(),
    postMessage: vi.fn(),
    onmessage: null,
    onerror: null
  } as unknown as Worker;
}

describe("AiWorkerPool", () => {
  it("acquires workers from factory when idle pool is empty", () => {
    let createdCount = 0;
    const pool = new AiWorkerPool(() => {
      createdCount += 1;
      return createMockWorker();
    });

    const workers = pool.acquire(2);
    expect(workers.length).toBe(2);
    expect(createdCount).toBe(2);
    expect(pool.busyCount).toBe(2);
    expect(pool.idleCount).toBe(0);
  });

  it("reuses idle workers when released", () => {
    let createdCount = 0;
    const pool = new AiWorkerPool(() => {
      createdCount += 1;
      return createMockWorker();
    });

    const [first] = pool.acquire(2);
    pool.release(first);

    expect(pool.idleCount).toBe(1);
    expect(pool.busyCount).toBe(1);

    const reacquired = pool.acquire(1);
    expect(reacquired[0]).toBe(first);
    expect(createdCount).toBe(2); // No new worker created!
  });

  it("terminates busy workers when cancelled mid-flight", () => {
    const pool = new AiWorkerPool(() => createMockWorker());
    const workers = pool.acquire(2);

    pool.terminateBusy([workers[0]]);
    expect(workers[0].terminate).toHaveBeenCalled();
    expect(pool.busyCount).toBe(1);

    pool.release(workers[1]);
    expect(pool.idleCount).toBe(1);
  });

  it("terminates all workers on disposal", () => {
    const pool = new AiWorkerPool(() => createMockWorker());
    const workers = pool.acquire(2);
    pool.release(workers[0]);

    pool.terminateAll();
    expect(workers[0].terminate).toHaveBeenCalled();
    expect(workers[1].terminate).toHaveBeenCalled();
    expect(pool.poolSize).toBe(0);
  });
});
