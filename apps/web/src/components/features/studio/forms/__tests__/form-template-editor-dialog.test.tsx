// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  enableReactActEnvironment,
  installNoopResizeObserver,
  renderInAct,
  unmountInAct,
} from "@/test-utils/react-act";
import { WorkspaceSlugProvider } from "@/lib/client/workspace-context";
import { CandidateFormTemplateEditorDialog } from "../form-template-editor-dialog";

enableReactActEnvironment();
installNoopResizeObserver();

const roots: Awaited<ReturnType<typeof renderInAct>>["root"][] = [];

afterEach(async () => {
  for (const root of roots) {
    await unmountInAct(root);
  }
  roots.length = 0;
});

describe("CandidateFormTemplateEditorDialog", () => {
  it("can open the create dialog without recursively resetting form state", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({ addEventListener: () => {}, matches: false, removeEventListener: () => {} }),
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { root } = await renderInAct(
      <QueryClientProvider client={queryClient}>
        <WorkspaceSlugProvider id="org-default" memberRole="admin" permissions={{}} slug="default">
          <CandidateFormTemplateEditorDialog
            jobDescriptions={[]}
            onOpenChange={() => {}}
            onSaved={() => {}}
            open
            record={null}
          />
        </WorkspaceSlugProvider>
      </QueryClientProvider>,
    );
    roots.push(root);

    expect(document.body.textContent).toContain("创建表单题");
  });
});
