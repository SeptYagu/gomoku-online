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
 */

export const DEFAULT_GAME_MODE: GameMode = "local";

// 启动快照只在页面加载时读一次；之后的变更由 React 状态接管，所以订阅是空实现。
export function subscribeToBootState(): () => void {
  return () => {};
}

function readGameModeFromUrl(): GameMode {
  if (typeof window === "undefined") {
    return DEFAULT_GAME_MODE;
  }

  return new URLSearchParams(window.location.search).has("room") ? "room" : DEFAULT_GAME_MODE;
}

function getServerGameMode(): GameMode {
  return DEFAULT_GAME_MODE;
}

/** 带 ?room= 的房间邀请链接应当直接进入联机工作区。 */
export function useBootGameMode(): GameMode {
  return useSyncExternalStore(subscribeToBootState, readGameModeFromUrl, getServerGameMode);
}
