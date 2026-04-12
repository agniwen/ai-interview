import { atomWithStorage, createJSONStorage } from 'jotai/utils';

const localStore = createJSONStorage<boolean>(() =>
  typeof localStorage !== 'undefined' ? localStorage : (undefined as unknown as Storage),
);

export const thinkingModeAtom = atomWithStorage('chat-thinking-mode', false, localStore, { getOnInit: true });
