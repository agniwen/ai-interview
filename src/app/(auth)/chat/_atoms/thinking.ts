import { atomWithStorage, createJSONStorage } from "jotai/utils";

const localStore = createJSONStorage<boolean>(() =>
  typeof localStorage === "undefined" ? (undefined as unknown as Storage) : localStorage,
);

export const thinkingModeAtom = atomWithStorage("chat-thinking-mode-v2", false, localStore, {
  getOnInit: true,
});
