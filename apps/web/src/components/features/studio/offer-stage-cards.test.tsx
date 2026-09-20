// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import {
  createRootRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
} from "@tanstack/react-router";
import { WorkspaceSlugProvider } from "@/lib/client/workspace-context";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OfferDraftRecord } from "@app/shared/studio-pipeline-stages";

import { buildOfferLinkCopy, OfferCardView } from "./offer-stage-cards";

const apiCalls = vi.fn<typeof fetch>();
let approvalRequired = true;
let approvalStatus = "pending";

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
  contentRevision: 1,
  createdAt: "2026-08-05T00:00:00.000Z",
  currency: "CNY",
  currentApprovalId: null,
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

beforeEach(() => {
  approvalRequired = true;
  approvalStatus = "pending";
  apiCalls.mockImplementation((input) => {
    const url = String(input);
    if (url.includes("approval-policy")) {
      return Promise.resolve(Response.json({ approvalRequired }));
    }
    return Promise.resolve(
      Response.json(
        url.includes("offer-approvals")
          ? { canManage: true, invalidatedAt: null, status: approvalStatus }
          : draft,
      ),
    );
  });
  vi.stubGlobal("fetch", apiCalls);
});
afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("OfferCard", () => {
  it("uses the history-preserving void action after withdrawal", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const queryClient = new QueryClient();
    const onCancelled = vi.fn();
    try {
      act(() =>
        root.render(
          <QueryClientProvider client={queryClient}>
            <OfferCardView
              canDelete
              canUpdate
              candidateId="candidate-1"
              candidateEmail={null}
              candidateName="候选人"
              dependencies={offerCardDependencies}
              draft={{ ...draft, currentApprovalId: "approval-1" }}
              onCancelled={onCancelled}
              onRespond={vi.fn()}
              onSaved={vi.fn()}
            />
          </QueryClientProvider>,
        ),
      );
      const button = [...host.querySelectorAll("button")].find(
        (item) => item.textContent === "作废 Offer 草稿",
      );
      expect(button).toBeDefined();
      act(() => button?.click());
      await vi.waitFor(() => expect(onCancelled).toHaveBeenCalledOnce());
      expect(apiCalls.mock.calls.some(([url]) => String(url).endsWith("/offer-1/void"))).toBe(true);
      expect(apiCalls.mock.calls.some(([url]) => String(url).endsWith("/offer-1/cancel"))).toBe(
        false,
      );
    } finally {
      act(() => root.unmount());
      queryClient.clear();
    }
  });

  it("enables publication when another user finishes approval while the card stays open", async () => {
    vi.useFakeTimers();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const publishButton = () =>
      [...host.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("确认并发布"),
      );
    try {
      const routeTree = createRootRoute({
        component: () => (
          <WorkspaceSlugProvider
            id="org-1"
            slug="acme"
            memberRole="admin"
            permissions={{ offerApproval: ["read"], page: ["offerApprovals"] }}
          >
            <OfferCardView
              canDelete
              canUpdate
              candidateId="candidate-1"
              candidateEmail={null}
              candidateName="候选人"
              dependencies={offerCardDependencies}
              draft={{ ...draft, currentApprovalId: "approval-1" }}
              onCancelled={vi.fn()}
              onRespond={vi.fn()}
              onSaved={vi.fn()}
            />
          </WorkspaceSlugProvider>
        ),
      });
      const router = createRouter({
        history: createMemoryHistory({ initialEntries: ["/"] }),
        routeTree,
        scrollRestoration: false,
      });
      await router.load();
      act(() =>
        root.render(
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>,
        ),
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(host.textContent).toContain("待审批");
      expect(publishButton()?.disabled).toBe(true);
      approvalStatus = "approved";
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_001);
      });
      expect(host.textContent).toContain("已通过");
      expect(publishButton()?.disabled).toBe(false);
    } finally {
      act(() => root.unmount());
      queryClient.clear();
    }
  });

  it("shows the pending approval state and moves withdrawal into the Offer card", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    try {
      const routeTree = createRootRoute({
        component: () => (
          <WorkspaceSlugProvider
            id="org-1"
            slug="acme"
            memberRole="admin"
            permissions={{
              offerApproval: ["create", "read"],
              page: ["offerApprovals"],
            }}
          >
            <OfferCardView
              canDelete
              canUpdate
              candidateId="candidate-1"
              candidateEmail={null}
              candidateName="候选人"
              dependencies={offerCardDependencies}
              draft={{ ...draft, currentApprovalId: "approval-1" }}
              onCancelled={vi.fn()}
              onRespond={vi.fn()}
              onSaved={vi.fn()}
            />
          </WorkspaceSlugProvider>
        ),
      });
      const router = createRouter({
        history: createMemoryHistory({ initialEntries: ["/"] }),
        routeTree,
        scrollRestoration: false,
      });
      await router.load();
      act(() =>
        root.render(
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>,
        ),
      );

      await vi.waitFor(() => expect(host.textContent).toContain("审批中"));
      expect(
        [...host.querySelectorAll('[data-slot="badge"]')]
          .map((badge) => badge.textContent?.trim())
          .filter((label) => label === "草稿" || label === "审批中"),
      ).toEqual(["审批中"]);
      expect(host.textContent).toContain("当前审批");
      expect(host.textContent).not.toContain("提交审批");

      const withdrawButton = [...host.querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === "撤回本轮审批",
      );
      expect(withdrawButton).toBeDefined();
      act(() => withdrawButton?.click());
      expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
        "撤回后，本轮审批会结束并保留在历史记录中",
      );
      expect(
        [...(document.querySelector('[role="dialog"]')?.querySelectorAll("button") ?? [])].find(
          (button) => button.textContent?.trim() === "确认撤回",
        )?.disabled,
      ).toBe(true);
    } finally {
      act(() => root.unmount());
      queryClient.clear();
    }
  });

  it.each([
    { expectedLabel: "已发布，待回复", status: "sent" },
    { expectedLabel: "已接受", status: "accepted" },
  ] as const)(
    "shows the $expectedLabel Offer lifecycle status after approval",
    async ({ expectedLabel, status }) => {
      approvalStatus = "approved";
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      try {
        const routeTree = createRootRoute({
          component: () => (
            <WorkspaceSlugProvider
              id="org-1"
              slug="acme"
              memberRole="admin"
              permissions={{ offerApproval: ["read"], page: ["offerApprovals"] }}
            >
              <OfferCardView
                canDelete
                canUpdate
                candidateId="candidate-1"
                candidateEmail={null}
                candidateName="候选人"
                dependencies={offerCardDependencies}
                draft={{
                  ...draft,
                  currentApprovalId: "approval-1",
                  publishedAt: "2026-09-20T00:00:00.000Z",
                  sentAt: "2026-09-20T00:00:00.000Z",
                  status,
                }}
                onCancelled={vi.fn()}
                onRespond={vi.fn()}
                onSaved={vi.fn()}
              />
            </WorkspaceSlugProvider>
          ),
        });
        const router = createRouter({
          history: createMemoryHistory({ initialEntries: ["/"] }),
          routeTree,
          scrollRestoration: false,
        });
        await router.load();
        act(() =>
          root.render(
            <QueryClientProvider client={queryClient}>
              <RouterProvider router={router} />
            </QueryClientProvider>,
          ),
        );

        await act(async () => {
          await vi.waitFor(() => expect(host.textContent).toContain("当前审批"));
        });
        expect(host.querySelector('[data-slot="badge"]')?.textContent?.trim()).toBe(expectedLabel);
      } finally {
        act(() => root.unmount());
        queryClient.clear();
      }
    },
  );

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

  it("requires approval before a draft can be published when a template is enabled", async () => {
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
    await vi.waitFor(() => expect(host.textContent).toContain("请先提交并完成审批"));
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
    expect(sendButton?.disabled).toBe(true);
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    act(() => root.unmount());
  });

  it("allows direct publication when no approval template is enabled", async () => {
    approvalRequired = false;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

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
            draft={draft}
            onCancelled={vi.fn()}
            onRespond={vi.fn()}
            onSaved={vi.fn()}
          />
        </QueryClientProvider>,
      ),
    );

    const publishButton = () =>
      [...host.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("确认并发布"),
      );
    await vi.waitFor(() => expect(publishButton()?.disabled).toBe(false));
    expect(host.textContent).not.toContain("请先提交并完成审批");

    act(() => root.unmount());
    queryClient.clear();
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
