// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { SectionLead } from "./section";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("SectionLead", () => {
  it("uses eighty-percent white for dark-mode descriptions", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(<SectionLead>Description</SectionLead>);
    });

    expect(container.querySelector("p")?.className).toContain("dark:text-white/80");

    act(() => root.unmount());
    container.remove();
  });
});
