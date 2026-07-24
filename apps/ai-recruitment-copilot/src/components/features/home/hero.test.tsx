// @vitest-environment jsdom

import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { Hero } from "./hero";

vi.mock("motion/react", () => ({
  useReducedMotion: () => true,
}));

vi.mock("@/components/react-bits/fade-content", () => ({
  FadeContent: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock("@/components/react-bits/split-text", () => ({
  SplitText: ({ text }: { text: string }) => <span>{text}</span>,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Hero", () => {
  it("keeps dark-mode copy readable over the animated mesh", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Hero onResumeFiltering={vi.fn()} onWorkbench={vi.fn()} />);
    });

    const scrim = container.querySelector<HTMLElement>(".hero-contrast-scrim");
    const heading = container.querySelector("h1");
    const description = container.querySelector("p.font-serif");

    expect(scrim).not.toBeNull();
    expect(scrim?.getAttribute("aria-hidden")).toBe("true");
    expect(scrim?.className).toContain("dark:block");
    expect(heading?.className).toContain("dark:text-white");
    expect(description?.className).toContain("dark:text-slate-100");

    act(() => root.unmount());
    container.remove();
  });
});
