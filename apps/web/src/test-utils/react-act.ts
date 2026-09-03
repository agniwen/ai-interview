import { setTimeout as delay } from "node:timers/promises";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { vi } from "vitest";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

/**
 * Flush React state updates from microtasks + one macrotask.
 * Needed when createRoot tests await network mocks / react-query outside `act`.
 */
export async function flushReactUpdates(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await delay(0);
  });
}

export async function renderInAct(ui: ReactNode): Promise<{
  container: HTMLDivElement;
  root: Root;
}> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(ui);
    await Promise.resolve();
  });
  await flushReactUpdates();

  return { container, root };
}

/** Poll until `assert` passes, flushing React between attempts. */
export async function waitForUi(
  assert: () => void,
  options?: { timeout?: number; interval?: number },
): Promise<void> {
  const timeout = options?.timeout ?? 2000;
  const interval = options?.interval ?? 16;
  const started = Date.now();
  let lastError: unknown;

  while (Date.now() - started < timeout) {
    try {
      await flushReactUpdates();
      assert();
      return;
    } catch (error) {
      lastError = error;
      await delay(interval);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`waitForUi timed out after ${timeout}ms`);
}

export async function unmountInAct(root: Root): Promise<void> {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
}

/** Mark this jsdom global as a React act environment (React 19). */
export function enableReactActEnvironment(): void {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
}

export function installNoopResizeObserver(): void {
  class TestResizeObserver implements ResizeObserver {
    disconnect: ResizeObserver["disconnect"] = vi.fn();
    observe: ResizeObserver["observe"] = vi.fn();
    unobserve: ResizeObserver["unobserve"] = vi.fn();
  }
  globalThis.ResizeObserver = TestResizeObserver;
}
