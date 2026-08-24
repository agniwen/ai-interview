import { atomWithStorage, createJSONStorage } from "jotai/utils";

const STORAGE_KEY = "arc:sidebar-open";

const storage = createJSONStorage<boolean>(() => {
  const browserWindow = globalThis.window;
  if (!browserWindow) {
    const memory = new Map<string, string>();
    return {
      getItem: (key) => memory.get(key) ?? null,
      removeItem: (key) => {
        memory.delete(key);
      },
      setItem: (key, value) => {
        memory.set(key, value);
      },
    };
  }
  return browserWindow.localStorage;
});

export const sidebarOpenAtom = atomWithStorage(STORAGE_KEY, true, storage);
