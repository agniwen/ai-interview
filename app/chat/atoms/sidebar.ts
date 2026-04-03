import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export const isSidebarCollapsedAtom = atomWithStorage('sidebar-collapsed', false);
export const isMobileSidebarOpenAtom = atom(false);
