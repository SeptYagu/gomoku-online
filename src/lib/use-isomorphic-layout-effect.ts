import { useEffect, useLayoutEffect } from "react";

/**
 * SSR 安全的布局副作用 Hook。
 * 客户端使用同步的 useLayoutEffect（在 DOM 变更后、绘制前同步执行），
 * 服务端静态渲染阶段安全回退至 useEffect，避免控制台报错。
 */
export const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;
