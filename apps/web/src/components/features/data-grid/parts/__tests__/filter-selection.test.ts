// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const storageKey = "arc:list-filter-selection:v1";
const saved = new Map<string, string>();
beforeEach(() => {
  saved.clear();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => saved.get(key) ?? null,
      removeItem: (key: string) => saved.delete(key),
      setItem: (key: string, value: string) => saved.set(key, value),
    },
  });
  vi.resetModules();
});

describe("listFilterSelectionAtom", () => {
  it("uses getOnInit to restore field choices before subscription", async () => {
    saved.set(storageKey, '{"studio-resumes":["text:company","text:school"]}');
    const [{ createStore }, { listFilterSelectionAtom }] = await Promise.all([
      import("jotai"),
      import("../filter-selection"),
    ]);
    const store = createStore();
    expect(store.get(listFilterSelectionAtom)).toEqual({
      "studio-resumes": ["text:company", "text:school"],
    });
    store.set(listFilterSelectionAtom, { "resume-pool": ["text:email"] });
    expect(saved.get(storageKey)).toBe('{"resume-pool":["text:email"]}');
  });

  it("ignores malformed JSON in localStorage", async () => {
    saved.set(storageKey, "not-json");
    const [{ createStore }, { listFilterSelectionAtom }] = await Promise.all([
      import("jotai"),
      import("../filter-selection"),
    ]);
    expect(createStore().get(listFilterSelectionAtom)).toEqual({});
  });
});
