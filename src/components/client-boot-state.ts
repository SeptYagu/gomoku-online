"use client";

import { useSyncExternalStore } from "react";
import type { GameMode } from "./online/workspace-state";

/**
 * 浏览器端「启动快照」读取器。
 *
 * 有一类状态只存在于浏览器：URL 查询参数、localStorage / sessionStorage。
 * 它们的值在服务端渲染时读不到，如果在 useState 初始化器里读，服务端会渲染出
 * 一套默认值、客户端首屏又是另一套，就会触发 React 水合不一致告警并闪烁。
 *
 * 这里统一走 useSyncExternalStore：hydration 阶段 React 用 getServerSnapshot
 * （纯默认值，与服务端完全一致），水合完成后再取客户端快照并在有差异时自动重渲染。
 * 因此既不需要「挂载后 setState」（会级联渲染，也被 react-hooks 规则禁止），
 * 也不会出现水合不一致。
 *
 * 快照必须是原始值或稳定引用，否则 React 会判定「每次渲染都变了」而循环重渲染。
 *
 * ⚠️ 快照函数**必须自带缓存**（下面的 `bootGameModeCache ??=`，或 room-state-utils.ts 里
 * `useBootSnapshot` 的 `useRef` 缓存）。React 在非水合路径下每次渲染都会重新调用 getSnapshot 并与上次
 * 结果比较，不同就立刻以新值渲染；而这一层没有任何订阅通知，URL/storage 却会被
 * 本模块之外的代码改写（例如 `syncRoomUrl` / `clearRoomUrl` 里的 history.replaceState）。
 * 不缓存就等于把一个「启动快照」变成了随 URL 浮动的活值：离开房间时 `?room=` 被抹掉，
 * 模式就会静默从 room 掉回 local。
 */

export const DEFAULT_GAME_MODE: GameMode = "local";

// 启动快照只在页面加载时读一次；之后的变更由 React 状态接管，所以订阅是空实现。
export function subscribeToBootState(): () => void {
  return () => {};
}

/** 创建一个页面生命周期内只读取一次 URL 的模式快照。 */
export function createBootGameModeReader(readSearch: () => string | undefined): () => GameMode {
  let cache: GameMode | null = null;

  return () => {
    const search = readSearch();

    if (search === undefined) {
      return DEFAULT_GAME_MODE;
    }

    cache ??= new URLSearchParams(search).has("room") ? "room" : DEFAULT_GAME_MODE;
    return cache;
  };
}

// 与 room-state-utils.ts 的 useBootSnapshot 类似：读一次就定住，之后 URL 再变也不回头改写模式。
const readGameModeFromUrl = createBootGameModeReader(() =>
  typeof window === "undefined" ? undefined : window.location.search
);

function getServerGameMode(): GameMode {
  return DEFAULT_GAME_MODE;
}

/** 带 ?room= 的房间邀请链接应当直接进入联机工作区。 */
export function useBootGameMode(): GameMode {
  return useSyncExternalStore(subscribeToBootState, readGameModeFromUrl, getServerGameMode);
}
