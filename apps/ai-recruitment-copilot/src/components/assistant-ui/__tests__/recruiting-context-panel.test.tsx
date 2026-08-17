// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { RecruitingContextPanel } from "../recruiting-context-panel";
import type { RecruitingCopilotContextValue } from "../recruiting-copilot-context";
import { RecruitingCopilotContext } from "../recruiting-copilot-context";
import { WorkspaceSlugProvider } from "@/lib/client/workspace-context";

const openCandidateDetail = vi.fn();
const contextValue = {
  citations: [
    {
      id: "resume-1",
      label: "张妍",
      recordType: "resume_record",
      secondaryLabel: "创作者运营经理",
    },
    {
      id: "pool-1",
      label: "李雷",
      recordType: "resume_pool_item",
      secondaryLabel: "人才库",
    },
    {
      id: "job-1",
      label: "高级产品经理",
      recordType: "job_description",
      secondaryLabel: null,
    },
  ],
  conversationId: null,
  markProposal: vi.fn(),
  openCandidateDetail,
  openResumeDetail: vi.fn(),
  openResumePreview: vi.fn(),
  proposalStatuses: {},
  proposals: [],
  upsertCitations: vi.fn(),
  upsertProposal: vi.fn(),
} satisfies RecruitingCopilotContextValue;

// SAFETY: This test constructs the value with the asserted contract before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("RecruitingContextPanel", () => {
  it("opens candidate citations in a modal while keeping job citations as links", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(() =>
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <WorkspaceSlugProvider id="org-1" memberRole="admin" permissions={{}} slug="acme">
            <RecruitingCopilotContext.Provider value={contextValue}>
              <RecruitingContextPanel />
            </RecruitingCopilotContext.Provider>
          </WorkspaceSlugProvider>
        </QueryClientProvider>,
      ),
    );
    const expand = container.querySelector<HTMLButtonElement>('[aria-label="展开上下文"]');
    await act(() => expand?.click());

    const candidateButtons = [...container.querySelectorAll<HTMLButtonElement>("button")].filter(
      (button) => button.textContent?.includes("张妍") || button.textContent?.includes("李雷"),
    );
    expect(candidateButtons).toHaveLength(2);

    await act(() => candidateButtons[0]?.click());
    await act(() => candidateButtons[1]?.click());

    expect(openCandidateDetail).toHaveBeenNthCalledWith(1, {
      id: "resume-1",
      kind: "resume_record",
    });
    expect(openCandidateDetail).toHaveBeenNthCalledWith(2, {
      id: "pool-1",
      kind: "resume_pool",
    });
    expect(container.querySelector('a[href="/w/acme/studio/job-descriptions"]')).not.toBeNull();
    expect(container.querySelector('a[href="/w/acme/studio/resumes"]')).toBeNull();
    expect(container.querySelector('a[href="/w/acme/studio/resume-pool"]')).toBeNull();

    await act(() => root.unmount());
  });
});
