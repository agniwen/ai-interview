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
  it("uses the existing copy and controls for dark-mode contrast", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Hero onResumeFiltering={vi.fn()} onWorkbench={vi.fn()} />);
    });

    const heading = container.querySelector("h1");
    const brand = heading?.querySelector("span");
    const description = container.querySelector("p.font-serif");
    const buttons = container.querySelectorAll("button");

    expect(heading?.className).toContain("dark:text-white");
    expect(brand?.className).toContain("dark:text-violet-100");
    expect(description?.className).toContain("dark:text-white/80");
    expect(heading?.className).not.toContain("text-shadow");
    expect(description?.className).not.toContain("text-shadow");
    expect(buttons[0]?.className).toContain("dark:text-white");
    expect(buttons[1]?.className).toContain("dark:text-slate-950");

    act(() => root.unmount());
    container.remove();
  });
});
