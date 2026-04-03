import { atomWithStorage, createJSONStorage } from 'jotai/utils';

const sessionStore = createJSONStorage<boolean>(() => sessionStorage);

export const hasSeenResourceNoticeAtom = atomWithStorage('chat-resource-notice-seen', false, sessionStore);
