// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OfferDraftRecord } from "@arc/shared/studio-pipeline-stages";

import { OfferCard } from "./offer-stage-cards";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = vi.fn().mockReturnValue({
  addEventListener: vi.fn(),
  matches: false,
  removeEventListener: vi.fn(),
});

vi.mock("@/lib/client/api", () => ({
  cancelOfferDraft: vi.fn(),
  fetchStudioResume: vi.fn(),
  patchOfferDraft: vi.fn(),
  sendOfferDraft: vi.fn(),
  updateCandidateExpectations: vi.fn(),
}));

vi.mock("@/lib/client/workspace-context", () => ({
  useWorkspaceSlug: () => "acme",
}));

const draft: OfferDraftRecord = {
  baseSalary: 30_000,
  bonus: null,
  candidateCounter: null,
  createdAt: "2026-08-05T00:00:00.000Z",
  currency: "CNY",
  equity: null,
  expiresAt: null,
  id: "offer-1",
  interviewRecordId: "candidate-1",
  joiningDate: null,
  notes: null,
  organizationId: "org-1",
  position: "产品经理",
  responseAt: null,
  sentAt: null,
  status: "draft",
  updatedAt: "2026-08-05T00:00:00.000Z",
  version: 1,
};

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("OfferCard", () => {
  it("hides the send action for draft offers", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <OfferCard
            canDelete
            canUpdate
            candidateId="candidate-1"
            draft={draft}
            onCancelled={vi.fn()}
            onRespond={vi.fn()}
            onSaved={vi.fn()}
          />
        </QueryClientProvider>,
      );
    });

    expect(host.textContent).toContain("编辑");
    expect(host.textContent).not.toContain("发送");

    act(() => root.unmount());
  });
});
