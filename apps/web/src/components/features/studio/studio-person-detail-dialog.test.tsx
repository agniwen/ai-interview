// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioPersonDetailDialog } from "./studio-person-detail-dialog";

// SAFETY: Vitest's jsdom global supports React's documented act-environment marker.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("StudioPersonDetailDialog", () => {
  it("does not render its lazy fallback into the page while closed", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <StudioPersonDetailDialog
          mode="interview"
          onOpenChange={vi.fn()}
          open={false}
          recordId={null}
          roundId={null}
        />,
      );
    });

    expect(container.querySelector('[aria-label="候选人详情正在加载"]')).toBeNull();
    act(() => root.unmount());
  });
});
