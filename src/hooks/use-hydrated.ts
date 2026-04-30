"use client";

import { useSyncExternalStore } from "react";

/**
 * 检测组件是否已经在客户端水合（hydrated）。
 * Detect whether the component has been hydrated on the client.
 *
 * 实现思路：服务端永远返回 `false`，客户端常量返回 `true`。借助 React 18 的
 * `useSyncExternalStore` 在 SSR 与 CSR 之间保证一致的快照行为，避免水合不匹配警告。
 *
 * Implementation: the server snapshot is always `false`, the client snapshot is
 * always `true`. `useSyncExternalStore` keeps SSR and CSR snapshots consistent so we
 * avoid hydration-mismatch warnings.
 */

const noopUnsubscribe = () => {
  // subscription has nothing to tear down / 没有需要清理的订阅
};
const subscribe = () => noopUnsubscribe;
const getSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * 客户端是否已完成水合。
 * Whether the client has finished hydration.
 */
export function useHydrated() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
