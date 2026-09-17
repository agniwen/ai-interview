// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OfferDraftRecord } from "@app/shared/studio-pipeline-stages";

import { buildOfferLinkCopy, OfferCardView } from "./offer-stage-cards";

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
  declineReason: null,
  emailRecipient: null,
  emailSentAt: null,
  equity: null,
  expiresAt: null,
  id: "offer-1",
  interviewRecordId: "candidate-1",
  joiningDate: null,
  notes: null,
  organizationId: "org-1",
  position: "产品经理",
  publicPath: null,
  publishedAt: null,
  publishedBy: null,
  responseAt: null,
  responseBy: null,
  responseSource: null,
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
  it("copies a forwardable offer invitation without exposing salary details", () => {
    const url = "https://example.com/offer/test-token?source=copy";
    expect(buildOfferLinkCopy({ candidateName: " 张三 ", position: " 产品经理 ", url })).toBe(
      `张三，您好！\n\n您的「产品经理」岗位 Offer 已准备好，请通过以下链接查看详情，并在页面中确认是否接受。如有疑问，请与 HR 联系。\n\nOffer 查看与确认链接：\n${url}`,
    );
  });

  it("uses a neutral greeting when candidate or position details are unavailable", () => {
    expect(buildOfferLinkCopy({ candidateName: " ", position: "", url: "/offer/token" })).toBe(
      "您好！\n\n您的 Offer 已准备好，请通过以下链接查看详情，并在页面中确认是否接受。如有疑问，请与 HR 联系。\n\nOffer 查看与确认链接：\n/offer/token",
    );
  });

  it("publishes a draft before exposing email and link actions", async () => {
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
            candidateEmail="candidate@example.com"
            candidateName="候选人"
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
    expect(host.textContent).toContain("删除 Offer");
    expect(host.textContent).not.toContain("v1");
    expect(host.textContent).toContain("确认并发布");
    const editButton = [...host.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "编辑",
    );
    act(() => editButton?.click());
    expect(host.textContent).toContain("职位*");
    expect(host.textContent).toContain("Base 月薪 (¥)*");
    expect(host.querySelector<HTMLInputElement>("#offer-offer-1-position")?.required).toBe(true);
    expect(host.querySelector<HTMLInputElement>("#offer-offer-1-base")?.required).toBe(true);

    const cancelEdit = [...host.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "取消",
    );
    act(() => cancelEdit?.click());
    const sendButton = [...host.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("确认并发布"),
    );
    await act(() => sendButton?.click());
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("发布后内容将锁定");
    const confirm = [...(dialog?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "确认",
    );
    expect(confirm?.disabled).toBe(false);

    act(() => root.unmount());
  });
  it("never exposes deletion after sending, even with delete permission", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const queryClient = new QueryClient();
    act(() =>
      root.render(
        <QueryClientProvider client={queryClient}>
          <OfferCardView
            canDelete
            canUpdate
            candidateId="candidate-1"
            candidateEmail="candidate@example.com"
            candidateName="候选人"
            dependencies={offerCardDependencies}
            draft={{
              ...draft,
              publicPath: "/offer/token",
              publishedAt: "2026-09-08T00:00:00.000Z",
              sentAt: "2026-09-08T00:00:00.000Z",
              status: "sent",
            }}
            onCancelled={vi.fn()}
            onRespond={vi.fn()}
            onSaved={vi.fn()}
          />
        </QueryClientProvider>,
      ),
    );
    expect(host.textContent).toContain("记录响应");
    expect(host.textContent).toContain("发送邮件");
    expect(host.textContent).toContain("复制 Offer 链接");
    expect(host.textContent).not.toContain("删除");
    expect(host.textContent).not.toContain("撤回");
    act(() => root.unmount());
  });
});
