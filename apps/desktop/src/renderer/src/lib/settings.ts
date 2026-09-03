import { useSyncExternalStore } from "react";
import { DEFAULT_DEEPGRAM_ENDPOINTING_MS } from "@app/shared/meeting-transcription";
import { orpc } from "./orpc";

/**
 * Desktop settings store, backed by the oRPC settings router (settings.json
 * in Electron `userData`).
 *
 * The renderer keeps an in-memory cache, updates optimistically, and persists
 * through `orpc.settings.set` — there is no save button; every change saves.
 * Initial values hydrate asynchronously via `hydrateSettings()` (called from
 * the renderer bootstrap); before that resolves, defaults are used.
 */

export type DesktopSettings = Awaited<ReturnType<typeof orpc.settings.get>>;
export type ThemeMode = DesktopSettings["theme"];
export type SettingsPatch = Parameters<typeof orpc.settings.set>[0];

const TRANSPARENT_BACKGROUND_STORAGE_KEY = "transparent-background";

function readCachedTransparentBackground(): boolean {
  try {
    return window.localStorage.getItem(TRANSPARENT_BACKGROUND_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

function cacheTransparentBackground(enabled: boolean): void {
  try {
    window.localStorage.setItem(TRANSPARENT_BACKGROUND_STORAGE_KEY, String(enabled));
  } catch {
    // settings.json remains the source of truth when localStorage is unavailable.
  }
}

const FALLBACK: DesktopSettings = {
  deepgramEndpointingMs: DEFAULT_DEEPGRAM_ENDPOINTING_MS,
  meetingLiveTranscriptProvider: "qwen",
  notifyOnFinish: false,
  theme: "system",
  transparentBackground: readCachedTransparentBackground(),
};

let cache: DesktopSettings = { ...FALLBACK };

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function getSettings(): DesktopSettings {
  return cache;
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSettings(): DesktopSettings {
  return useSyncExternalStore(subscribeSettings, getSettings);
}

/** Load the persisted snapshot once at startup. */
export async function hydrateSettings(): Promise<void> {
  try {
    cache = await orpc.settings.get();
    cacheTransparentBackground(cache.transparentBackground);
    emit();
  } catch {
    // Keep the fallback; the settings page still works, just with defaults.
  }
}

/**
 * Apply a partial update immediately and persist it. If the write fails the
 * optimistic value stays in memory for the session; the next change retries.
 */
export async function updateSettings(patch: SettingsPatch): Promise<void> {
  cache = { ...cache, ...patch };
  if (patch.transparentBackground !== undefined) {
    cacheTransparentBackground(patch.transparentBackground);
  }
  emit();
  try {
    cache = await orpc.settings.set(patch);
    emit();
  } catch {
    // Keep the optimistic value; persistence errors surface in main logs.
  }
}
