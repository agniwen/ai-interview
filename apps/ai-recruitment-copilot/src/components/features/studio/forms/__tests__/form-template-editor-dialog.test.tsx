// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enableReactActEnvironment,
  installNoopResizeObserver,
  renderInAct,
  unmountInAct,
} from "@/test-utils/react-act";
import { CandidateFormTemplateEditorDialog } from "../form-template-editor-dialog";

enableReactActEnvironment();
installNoopResizeObserver();

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@/lib/client/workspace-context", () => ({
  useWorkspaceSlug: () => "default",
}));

const roots: Awaited<ReturnType<typeof renderInAct>>["root"][] = [];

afterEach(async () => {
  for (const root of roots) {
    await unmountInAct(root);
  }
  roots.length = 0;
});

describe("CandidateFormTemplateEditorDialog", () => {
  it("can open the create dialog without recursively resetting form state", async () => {
    const { root } = await renderInAct(
      <CandidateFormTemplateEditorDialog
        jobDescriptions={[]}
        onOpenChange={() => {}}
        onSaved={() => {}}
        open
        record={null}
      />,
    );
    roots.push(root);

    expect(document.body.textContent).toContain("新建表单题");
  });
});
