// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CandidateFormTemplateEditorDialog } from "./form-template-editor-dialog";

const testGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

testGlobal.IS_REACT_ACT_ENVIRONMENT = true;

function TestResizeObserver() {}

TestResizeObserver.prototype.disconnect = vi.fn();
TestResizeObserver.prototype.observe = vi.fn();
TestResizeObserver.prototype.unobserve = vi.fn();
globalThis.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver;

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@/lib/client/workspace-context", () => ({
  useWorkspaceSlug: () => "default",
}));

const roots: ReturnType<typeof createRoot>[] = [];

afterEach(() => {
  for (const root of roots) {
    root.unmount();
  }
  roots.length = 0;
});

describe("CandidateFormTemplateEditorDialog", () => {
  it("can open the create dialog without recursively resetting form state", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(
        <CandidateFormTemplateEditorDialog
          jobDescriptions={[]}
          onOpenChange={() => {}}
          onSaved={() => {}}
          open
          record={null}
        />,
      );
    });

    expect(document.body.textContent).toContain("新建面试表单");
  });
});
