import { atomWithStorage, createJSONStorage } from 'jotai/utils';

const sessionStore = createJSONStorage<boolean>(() =>
  typeof sessionStorage !== 'undefined' ? sessionStorage : (undefined as unknown as Storage),
);

export const hasSeenResourceNoticeAtom = atomWithStorage('chat-resource-notice-seen', false, sessionStore, { getOnInit: true });
