import { afterEach, describe, expect, it, vi } from "vitest";
import { CHAT_ACK_TIMEOUT_MS, createChatSendGate } from "./chat-send-gate";

describe("chat send gate", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("blocks a second send in the same tick until the first one settles", () => {
    const gate = createChatSendGate();
    const onTimeout = vi.fn();

    expect(gate.begin(onTimeout)).toBe(true);
    expect(gate.isInFlight()).toBe(true);
    // 同一次点击事件循环里的连点：state 还没重渲染，只能靠这里挡住。
    expect(gate.begin(onTimeout)).toBe(false);

    gate.settle();
    expect(gate.isInFlight()).toBe(false);
    expect(gate.begin(onTimeout)).toBe(true);
  });

  it("resets and reports the timeout once when the server never acks", () => {
    vi.useFakeTimers();

    const gate = createChatSendGate();
    const onTimeout = vi.fn();

    gate.begin(onTimeout);
    vi.advanceTimersByTime(CHAT_ACK_TIMEOUT_MS - 1);
    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    // 闸门必须已经放开，否则发送按钮就永久禁用了（socket.io 会静默丢弃断线时的普通 ack）。
    expect(gate.isInFlight()).toBe(false);

    vi.advanceTimersByTime(CHAT_ACK_TIMEOUT_MS * 3);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(gate.begin(onTimeout)).toBe(true);
  });

  it("cancels the watchdog when the ack arrives in time", () => {
    vi.useFakeTimers();

    const gate = createChatSendGate();
    const onTimeout = vi.fn();

    gate.begin(onTimeout);
    vi.advanceTimersByTime(CHAT_ACK_TIMEOUT_MS / 2);
    gate.settle();

    vi.advanceTimersByTime(CHAT_ACK_TIMEOUT_MS * 2);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("treats a late ack after the timeout as a no-op", () => {
    vi.useFakeTimers();

    const gate = createChatSendGate(50);
    const onTimeout = vi.fn();

    gate.begin(onTimeout);
    vi.advanceTimersByTime(50);
    expect(onTimeout).toHaveBeenCalledTimes(1);

    // 超时之后迟到的 ack：只能重复 settle，不能把闸门重新锁上。
    gate.settle();
    gate.settle();
    expect(gate.isInFlight()).toBe(false);
    expect(gate.begin(onTimeout)).toBe(true);
  });

  it("guards self-healing retry so an un-acked retry resets the gate instead of permanently locking", () => {
    vi.useFakeTimers();

    const gate = createChatSendGate();
    const onInitialTimeout = vi.fn();
    const onRetryTimeout = vi.fn();

    // 1. Initial send
    expect(gate.begin(onInitialTimeout)).toBe(true);
    expect(gate.isInFlight()).toBe(true);

    // Initial response arrives with error (e.g. guest-session-invalid), gate settled
    gate.settle();
    expect(gate.isInFlight()).toBe(false);
    expect(onInitialTimeout).not.toHaveBeenCalled();

    // 2. Self-healing retry must begin a new watchdog
    expect(gate.begin(onRetryTimeout)).toBe(true);
    expect(gate.isInFlight()).toBe(true);

    // 3. Retry ack dropped / never arrives
    vi.advanceTimersByTime(CHAT_ACK_TIMEOUT_MS);
    expect(onRetryTimeout).toHaveBeenCalledTimes(1);
    expect(gate.isInFlight()).toBe(false);

    // Gate is open again for next user attempt
    expect(gate.begin(vi.fn())).toBe(true);
  });
});
