// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ThemeProvider, useSystemThemeOverride } from "./theme-provider";

// SAFETY: React's test-only act flag belongs to the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function MobileTheme({ enabled }: { enabled: boolean }) {
  useSystemThemeOverride(enabled);
  return null;
}

it("follows system changes temporarily and restores the saved desktop theme", () => {
  let dark = false;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", () => ({
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    addListener: (listener: () => void) => listeners.add(listener),
    get matches() {
      return dark;
    },
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    removeListener: (listener: () => void) => listeners.delete(listener),
  }));
  localStorage.setItem("theme", "dark");
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = (enabled: boolean) =>
    act(() =>
      root.render(
        <ThemeProvider attribute="class" enableSystem>
          <MobileTheme enabled={enabled} />
        </ThemeProvider>,
      ),
    );
  try {
    render(true);
    expect(document.documentElement.classList.contains("light")).toBe(true);
    act(() => {
      dark = true;
      for (const listener of listeners) {
        listener();
      }
    });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    act(() => {
      dark = false;
      for (const listener of listeners) {
        listener();
      }
    });
    expect(document.documentElement.classList.contains("light")).toBe(true);
    render(false);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("theme")).toBe("dark");
  } finally {
    act(() => root.unmount());
    localStorage.clear();
    document.documentElement.className = "";
    vi.unstubAllGlobals();
  }
});
