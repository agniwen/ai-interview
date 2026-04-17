import { atomWithStorage, createJSONStorage } from "jotai/utils";

const localStore = createJSONStorage<boolean>(() =>
  typeof localStorage === "undefined" ? (undefined as unknown as Storage) : localStorage,
);

export const thinkingModeAtom = atomWithStorage("chat-thinking-mode", false, localStore, {
  getOnInit: true,
});
