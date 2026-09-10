import { afterEach, describe, expect, it, vi } from "vitest";
import { createLeaveRoomAttempt, LEAVE_ROOM_TIMEOUT_MS } from "./leave-room-attempt";

describe("leave room attempt", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("settles once when the ack arrives before the timeout", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const attempt = createLeaveRoomAttempt(onTimeout);

    expect(attempt.settle()).toBe(true);
    expect(attempt.settle()).toBe(false);
    vi.advanceTimersByTime(LEAVE_ROOM_TIMEOUT_MS);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("reports a timeout once and rejects a late ack", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const attempt = createLeaveRoomAttempt(onTimeout);

    vi.advanceTimersByTime(LEAVE_ROOM_TIMEOUT_MS);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(attempt.settle()).toBe(false);

    vi.advanceTimersByTime(LEAVE_ROOM_TIMEOUT_MS * 2);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("can be settled during unmount without invoking callbacks", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const attempt = createLeaveRoomAttempt(onTimeout);

    expect(attempt.settle()).toBe(true);
    vi.runAllTimers();
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
