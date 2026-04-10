import { atom } from 'jotai';

/**
 * Tracks the current tutorial step index, or `null` when no tutorial is active.
 * Written imperatively from driver.js callbacks via `getDefaultStore()`,
 * read reactively in components via `useAtomValue`.
 */
export const tutorialStepAtom = atom<number | null>(null);
