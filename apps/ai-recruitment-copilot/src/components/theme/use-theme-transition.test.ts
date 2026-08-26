// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runThemeTransition } from "./use-theme-transition";

function createTransition(update: () => void) {
  const finished = Promise.withResolvers<null>();
  const ready = Promise.withResolvers<null>();
  return {
    finish: () => {
      ready.resolve(null);
      finished.resolve(null);
    },
    finished: finished.promise,
    ready: ready.promise,
    rejectReady: ready.reject,
    skipTransition: vi.fn(),
    update,
  };
}

const originalStart = Object.getOwnPropertyDescriptor(document, "startViewTransition");
let transitions: ReturnType<typeof createTransition>[] = [];
let reduceMotion = false;
const start = vi.fn((update: () => void) => {
  const transition = createTransition(update);
  transitions.push(transition);
  return transition;
});

beforeEach(() => {
  transitions = [];
  reduceMotion = false;
  start.mockClear();
  Object.defineProperty(document, "startViewTransition", { configurable: true, value: start });
  vi.stubGlobal("matchMedia", () => ({ matches: reduceMotion }));
});

afterEach(() => {
  runThemeTransition(() => {}, false);
  if (originalStart) {
    Object.defineProperty(document, "startViewTransition", originalStart);
  } else {
    Reflect.deleteProperty(document, "startViewTransition");
  }
  vi.unstubAllGlobals();
});

describe("triangle blur theme transition", () => {
  it("updates inside the snapshot callback and cleans up the scoped styles", async () => {
    const update = vi.fn();
    runThemeTransition(update);
    expect(update).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.themeTransition).toBe("triangle-blur");
    transitions[0]?.update();
    expect(update).toHaveBeenCalledOnce();
    transitions[0]?.finish();
    await vi.waitFor(() => {
      expect(Object.hasOwn(document.documentElement.dataset, "themeTransition")).toBe(false);
    });
  });

  it.each(["unsupported", "reduced-motion", "disabled"])("switches directly for %s", (mode) => {
    if (mode === "unsupported") {
      Object.defineProperty(document, "startViewTransition", {
        configurable: true,
        value: undefined,
      });
    }
    reduceMotion = mode === "reduced-motion";
    const update = vi.fn();
    runThemeTransition(update, mode !== "disabled");
    expect(update).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
    expect(Object.hasOwn(document.documentElement.dataset, "themeTransition")).toBe(false);
  });

  it("lets the last selection win even if earlier snapshot callbacks run late", async () => {
    const first = vi.fn();
    const second = vi.fn();
    runThemeTransition(first);
    runThemeTransition(second);
    expect(transitions[0]?.skipTransition).toHaveBeenCalledOnce();
    transitions[0]?.update();
    transitions[0]?.finish();
    await Promise.resolve();
    expect(first).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.themeTransition).toBe("triangle-blur");
    transitions[1]?.update();
    expect(second).toHaveBeenCalledOnce();
    transitions[1]?.finish();
    await vi.waitFor(() => {
      expect(Object.hasOwn(document.documentElement.dataset, "themeTransition")).toBe(false);
    });
  });

  it("does not restore a stale theme after a direct switch", () => {
    const stale = vi.fn();
    const latest = vi.fn();
    runThemeTransition(stale);
    runThemeTransition(latest, false);
    transitions[0]?.update();
    expect(stale).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledOnce();
  });

  it("still applies the theme when the browser skips animation capture", async () => {
    const update = vi.fn();
    runThemeTransition(update);
    transitions[0]?.rejectReady(new Error("Snapshot skipped"));
    transitions[0]?.update();
    transitions[0]?.finish();
    expect(update).toHaveBeenCalledOnce();
    await vi.waitFor(() => {
      expect(Object.hasOwn(document.documentElement.dataset, "themeTransition")).toBe(false);
    });
  });
});
