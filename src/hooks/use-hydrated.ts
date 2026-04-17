"use client";

import { useSyncExternalStore } from "react";

const noopUnsubscribe = () => {
  // subscription has nothing to tear down
};
const subscribe = () => noopUnsubscribe;
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function useHydrated() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
