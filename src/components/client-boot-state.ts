"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";
import type { GameMode } from "./online/workspace-state";
import {
  readActiveGame,
  readSelectedWorkspace,
  type StoredActiveGame
} from "@/lib/game-persistence";

export const DEFAULT_GAME_MODE: GameMode = "local";

// 启动快照只在页面加载时读一次；之后的变更由 React 状态接管，所以订阅是空实现。
export function subscribeToBootState(): () => void {
  return () => {};
}

/**
 * 消除 R6 缺陷的实例级启动快照读取 Hook。
 * 使用 Hook 实例内部的 useRef 存放客户端快照，杜绝模块级变量污染与 HMR 状态残留。
 * 每次组件挂载（包含初次渲染与切语言软导航重挂载）均重新求值。
 */
export function useBootSnapshot<T>(
  computeClientSnapshot: () => T,
  serverSnapshot: T
): T {
  const cacheRef = useRef<T | null>(null);
  const getSnapshot = useCallback(() => {
    if (cacheRef.current === null) {
      cacheRef.current = computeClientSnapshot();
    }
    return cacheRef.current;
  }, [computeClientSnapshot]);

  const getServerSnapshot = useCallback(() => serverSnapshot, [serverSnapshot]);

  return useSyncExternalStore(subscribeToBootState, getSnapshot, getServerSnapshot);
}

/**
 * 四级启动模式判定优先级（Boot Mode Resolution Priority）：
 * 1. 优先级 1（URL 显式参数）：当前 URL 包含有效 ?room=XXXXXX -> 强制启动为 "room"
 * 2. 优先级 2（活跃单机/人机对局数据）：sessionStorage 存在通过校验的活跃对局 (moves.length > 0) -> 恢复对应模式 ("ai" 或 "local")
 * 3. 优先级 3（用户选中的工作区记录）：sessionStorage 存在合法的 gomoku-selected-workspace -> 恢复为该工作区
 * 4. 优先级 4（全局默认兜底）：默认回落为 "local"
 */
export function resolveBootGameMode(
  search?: string,
  activeGame?: StoredActiveGame | null,
  selectedWorkspace?: GameMode | null
): GameMode {
  if (search && new URLSearchParams(search).has("room")) {
    return "room";
  }

  if (activeGame && activeGame.moves.length > 0) {
    return activeGame.mode;
  }

  if (selectedWorkspace) {
    return selectedWorkspace;
  }

  return DEFAULT_GAME_MODE;
}

/**
 * 兼容测试与特定闭包场景的 reader 工厂
 */
export function createBootGameModeReader(
  readSearch: () => string | undefined,
  readActive?: () => StoredActiveGame | null,
  readWorkspace?: () => GameMode | null
): () => GameMode {
  let cache: GameMode | null = null;

  return () => {
    const search = readSearch();
    if (search === undefined) {
      return DEFAULT_GAME_MODE;
    }

    const activeGame = readActive ? readActive() : null;
    const selectedWorkspace = readWorkspace ? readWorkspace() : null;

    cache ??= resolveBootGameMode(search, activeGame, selectedWorkspace);
    return cache;
  };
}

export function useBootGameMode(): GameMode {
  return useBootSnapshot(() => {
    if (typeof window === "undefined") {
      return DEFAULT_GAME_MODE;
    }
    const search = window.location.search;
    const activeGame = readActiveGame();
    const selectedWorkspace = readSelectedWorkspace();
    return resolveBootGameMode(search, activeGame, selectedWorkspace);
  }, DEFAULT_GAME_MODE);
}

export function useBootActiveGame(): StoredActiveGame | null {
  return useBootSnapshot(() => {
    if (typeof window === "undefined") {
      return null;
    }
    return readActiveGame();
  }, null);
}
