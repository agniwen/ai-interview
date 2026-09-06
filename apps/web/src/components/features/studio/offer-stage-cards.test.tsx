// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OfferDraftRecord } from "@app/shared/studio-pipeline-stages";

import { OfferCardView } from "./offer-stage-cards";

// SAFETY: This test constructs the value with the asserted contract before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = vi.fn().mockReturnValue({
  addEventListener: vi.fn(),
  matches: false,
  removeEventListener: vi.fn(),
});

const offerCardDependencies = { slug: "acme" };

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
  it("opens a state-only send confirmation for a draft without requiring email", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <OfferCardView
            canDelete
            canUpdate
            candidateId="candidate-1"
            dependencies={offerCardDependencies}
            draft={draft}
            onCancelled={vi.fn()}
            onRespond={vi.fn()}
            onSaved={vi.fn()}
          />
        </QueryClientProvider>,
      );
    });

    expect(host.textContent).toContain("编辑");
    expect(host.textContent).toContain("标记 Offer 已发出");
    const sendButton = [...host.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("标记 Offer 已发出"),
    );
    await act(() => sendButton?.click());
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("本操作仅记录状态");
    expect(dialog?.textContent).not.toContain("即将发送至");
    const confirm = [...(dialog?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "确认",
    );
    expect(confirm?.disabled).toBe(false);

    act(() => root.unmount());
  });
});
