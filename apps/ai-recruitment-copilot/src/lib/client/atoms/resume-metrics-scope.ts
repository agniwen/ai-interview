import { atomWithStorage, createJSONStorage } from "jotai/utils";

/** Team = whole workspace; personal = only candidates the current user added. */
export type ResumeMetricsScope = "team" | "personal";

const STORAGE_KEY = "arc:resume-metrics-scope";

const storage = createJSONStorage<ResumeMetricsScope>(() => {
  if (typeof window === "undefined") {
    // SSR / prerender: fall back to an in-memory map so atomWithStorage
    // never touches window.localStorage during server render.
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
  return localStorage;
});

/**
 * Persisted resume-library chart dimension. Default is team-wide.
 * Read on init so the first client metrics request uses the stored value.
 */
export const resumeMetricsScopeAtom = atomWithStorage<ResumeMetricsScope>(
  STORAGE_KEY,
  "team",
  storage,
  { getOnInit: true },
);
