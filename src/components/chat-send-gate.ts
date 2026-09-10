/**
 * 聊天发送的「在途闸门」。
 *
 * 解决两个问题，缺一不可：
 *
 * 1. **防重入**：按钮的 disabled 由 React state 驱动，要等一次重渲染才生效；
 *    同一次点击事件循环里的连点会在重渲染之前再次 emit，所以真正的闸门必须是
 *    同步的（闭包变量），state 只负责把按钮画成禁用态。
 * 2. **防永久锁死**：socket.io 在断线时会**静默丢弃**普通 ack 回调
 *    （`Socket#_clearAcks` 只回调 `.timeout()` 产生的 withError ack）。
 *    服务端重启、网络抖动、丢包都会让 ack 永远不来；没有看门狗的话闸门会永久为
 *    true，发送按钮从此点不动，重连也不会恢复。所以每次 begin() 都挂一个超时兜底。
 */

export const CHAT_ACK_TIMEOUT_MS = 8_000;

export type ChatSendGate = {
  /** 是否仍有发送在途。 */
  isInFlight: () => boolean;
  /**
   * 进入「在途」并挂上超时看门狗。
   * 返回 false 表示已有一笔在途发送，调用方必须直接忽略本次点击（不要 emit）。
   * `onTimeout` 只会在「超时且仍在途」时触发一次。
   */
  begin: (onTimeout: () => void) => boolean;
  /** 收到 ack 或主动放弃：复位闸门并取消看门狗（幂等，可重复调用）。 */
  settle: () => void;
};

export function createChatSendGate(timeoutMs: number = CHAT_ACK_TIMEOUT_MS): ChatSendGate {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;

  function cancelWatchdog() {
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
  }

  return {
    isInFlight: () => inFlight,
    begin: (onTimeout) => {
      if (inFlight) {
        return false;
      }

      inFlight = true;
      timeoutHandle = setTimeout(() => {
        timeoutHandle = null;

        if (!inFlight) {
          return;
        }

        inFlight = false;
        onTimeout();
      }, timeoutMs);

      return true;
    },
    settle: () => {
      inFlight = false;
      cancelWatchdog();
    }
  };
}
