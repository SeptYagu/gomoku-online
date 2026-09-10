/**
 * 一次离开房间请求的生命周期。
 *
 * socket ack 可能永远不来，也可能在超时之后才到。调用方只有在 settle() 返回 true 时
 * 才能应用 ack 的副作用；这样超时结果与迟到 ack 不会分别改写两次 UI。
 */

export const LEAVE_ROOM_TIMEOUT_MS = 8_000;

export type LeaveRoomAttempt = {
  /** 结束当前尝试；仅第一次返回 true，并同步取消超时看门狗。 */
  settle: () => boolean;
};

export function createLeaveRoomAttempt(
  onTimeout: () => void,
  timeoutMs: number = LEAVE_ROOM_TIMEOUT_MS
): LeaveRoomAttempt {
  let pending = true;
  const timeoutHandle = setTimeout(() => {
    if (!settle()) {
      return;
    }

    onTimeout();
  }, timeoutMs);

  function settle(): boolean {
    if (!pending) {
      return false;
    }

    pending = false;
    clearTimeout(timeoutHandle);
    return true;
  }

  return { settle };
}
