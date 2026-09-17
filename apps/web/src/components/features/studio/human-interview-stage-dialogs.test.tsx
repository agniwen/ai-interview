// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceSlugProvider } from "@/lib/client/workspace-context";
import { TransitionCandidateDialog } from "./resumes/transition-candidate-dialog";
import { ScheduleRoundDialogView } from "./human-interview-stage-dialogs";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const membersEndpoint = "/studio/workspace/members/options";

// 弹窗挂载时会同时拉取候选人详情，所以只能按成员接口的 URL 统计刷新次数，
// 不能按 fetch 的总调用次数断言。
// The dialog also loads candidate detail on mount, so count refreshes by the
// members endpoint URL instead of total fetch calls.
function toRequestUrl(input: RequestInfo | URL): string {
  if (input instanceof URL) {
    return input.href;
  }
  if (input instanceof Request) {
    return input.url;
  }
  return input;
}

function membersFetchCalls() {
  return fetchMock.mock.calls.filter(([input]) => toRequestUrl(input).includes(membersEndpoint));
}

// SAFETY: This test constructs the value with the asserted contract before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    addEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
  })),
});

const scheduleDependencies = { slug: "test-workspace" };

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
  // 清除上一个用例设置的按 URL 路由实现，避免影响后续用例。
  fetchMock.mockReset();
});

describe("ScheduleRoundDialog", () => {
  it.each([undefined, "CEO面试"])(
    "supports CEO selection and interviewer refresh with default %s",
    async (defaultLabel) => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      queryClient.setQueryData(["workspace-members", "test-workspace"], {
        feishuHumanInterviewEnabled: false,
        records: [],
      });
      const membersPayload = {
        feishuHumanInterviewEnabled: false,
        records: [
          {
            email: "new@example.com",
            feishuProviderIds: ["feishu-jiguang-hr"],
            id: "new-member",
            image: null,
            name: "新面试官",
          },
        ],
      };
      fetchMock.mockImplementation((input: RequestInfo | URL) =>
        Promise.resolve(
          toRequestUrl(input).includes(membersEndpoint)
            ? Response.json(membersPayload, { status: 200 })
            : Response.json(null, { status: 404 }),
        ),
      );
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);

      await act(async () => {
        root.render(
          <QueryClientProvider client={queryClient}>
            <ScheduleRoundDialogView
              candidateId="candidate-1"
              candidateName="候选人"
              defaultLabel={defaultLabel}
              dependencies={scheduleDependencies}
              passedRoundCount={0}
              onOpenChange={vi.fn()}
              onScheduled={vi.fn()}
              open
            />
          </QueryClientProvider>,
        );
        await Promise.resolve();
      });

      expect(document.body.textContent).toContain("邀请成员");
      expect(document.body.textContent).toMatch(/面试时间\s*\*/);
      expect(document.body.textContent).toMatch(/面试官\s*\*/);
      expect(document.querySelector<HTMLInputElement>("#round-label")?.placeholder).toBe(
        "业务一面",
      );
      const ceoSwitch = document.querySelector<HTMLButtonElement>("#round-ceo");
      expect(ceoSwitch).not.toBeNull();
      if (defaultLabel !== "CEO面试") {
        act(() => {
          ceoSwitch?.click();
        });
      }
      expect(document.querySelector<HTMLInputElement>("#round-label")?.value).toBe("CEO面试");
      expect(document.querySelector<HTMLInputElement>("#round-label")?.readOnly).toBe(true);
      act(() => {
        ceoSwitch?.click();
      });
      expect(document.querySelector<HTMLInputElement>("#round-label")?.placeholder).toBe(
        "业务一面",
      );
      expect(document.querySelector<HTMLInputElement>("#round-label")?.readOnly).toBe(false);
      const refreshButton = document.querySelector<HTMLButtonElement>(
        'button[aria-label="刷新面试官列表"]',
      );
      await act(async () => {
        refreshButton?.click();
        await Promise.resolve();
      });

      await vi.waitFor(() => expect(membersFetchCalls()).toHaveLength(1));
      expect(queryClient.getQueryData(["workspace-members", "test-workspace"])).toEqual(
        expect.objectContaining({
          records: [expect.objectContaining({ id: "new-member", name: "新面试官" })],
        }),
      );

      act(() => root.unmount());
      queryClient.clear();
      host.remove();
    },
  );

  it("allows interviewers from different Feishu apps when Feishu human interviews are disabled", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(["workspace-members", "test-workspace"], {
      feishuHumanInterviewEnabled: false,
      records: [
        {
          email: "guang@example.com",
          feishuProviderIds: ["feishu"],
          id: "member-1",
          image: "https://example.com/guang.png",
          name: "光芒",
        },
        {
          email: "zhang@example.com",
          feishuProviderIds: ["feishu-jiguang-hr"],
          id: "member-2",
          image: null,
          name: "张三",
        },
      ],
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ScheduleRoundDialogView
            candidateId="candidate-1"
            candidateName="候选人"
            dependencies={scheduleDependencies}
            passedRoundCount={0}
            onOpenChange={vi.fn()}
            onScheduled={vi.fn()}
            open
          />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    const interviewerInput = document.querySelector<HTMLInputElement>(
      'input[aria-label="搜索成员…"]',
    );
    expect(interviewerInput).not.toBeNull();

    await act(async () => {
      interviewerInput?.focus();
      interviewerInput?.click();
      interviewerInput?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }),
      );
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(document.querySelectorAll('[data-slot="avatar"]')).toHaveLength(2);
      expect(document.body.textContent).toContain("张三");
      expect(document.body.textContent).toContain("张");
    });

    const primaryInterviewer = [
      ...document.querySelectorAll<HTMLElement>('[data-slot="combobox-item"]'),
    ].find((item) => item.textContent?.includes("光芒"));
    expect(primaryInterviewer).not.toBeUndefined();
    await act(async () => {
      primaryInterviewer?.click();
      await Promise.resolve();
    });

    const secondaryInterviewer = [
      ...document.querySelectorAll<HTMLElement>('[data-slot="combobox-item"]'),
    ].find((item) => item.textContent?.includes("张三"));
    expect(secondaryInterviewer?.getAttribute("aria-disabled")).not.toBe("true");

    act(() => root.unmount());
    queryClient.clear();
    host.remove();
  });

  it("disables interviewers from a different Feishu app when the integration is enabled", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(["workspace-members", "test-workspace"], {
      feishuHumanInterviewEnabled: true,
      records: [
        {
          email: "guang@example.com",
          feishuProviderIds: ["feishu"],
          id: "member-1",
          image: "https://example.com/guang.png",
          name: "光芒",
        },
        {
          email: "zhang@example.com",
          feishuProviderIds: ["feishu-jiguang-hr"],
          id: "member-2",
          image: null,
          name: "张三",
        },
      ],
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ScheduleRoundDialogView
            candidateId="candidate-1"
            candidateName="候选人"
            dependencies={scheduleDependencies}
            passedRoundCount={0}
            onOpenChange={vi.fn()}
            onScheduled={vi.fn()}
            open
          />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    const interviewerInput = document.querySelector<HTMLInputElement>(
      'input[aria-label="搜索成员…"]',
    );
    await act(async () => {
      interviewerInput?.focus();
      interviewerInput?.click();
      interviewerInput?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }),
      );
      await Promise.resolve();
    });

    const primaryInterviewer = [
      ...document.querySelectorAll<HTMLElement>('[data-slot="combobox-item"]'),
    ].find((item) => item.textContent?.includes("光芒"));
    expect(primaryInterviewer).not.toBeUndefined();
    await act(async () => {
      primaryInterviewer?.click();
      await Promise.resolve();
    });

    const secondaryInterviewer = [
      ...document.querySelectorAll<HTMLElement>('[data-slot="combobox-item"]'),
    ].find((item) => item.textContent?.includes("张三"));
    expect(secondaryInterviewer?.getAttribute("aria-disabled")).toBe("true");

    act(() => root.unmount());
    queryClient.clear();
    host.remove();
  });
});

describe("recruiting dialog text limits", () => {
  it.each(["round-notes", "reactivation-reason"])(
    "shows the limit and detects oversized %s",
    async (inputId) => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      fetchMock.mockResolvedValue(Response.json(null, { status: 404 }));
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      try {
        await act(() => {
          root.render(
            <QueryClientProvider client={queryClient}>
              <WorkspaceSlugProvider
                slug="test-workspace"
                id="workspace-1"
                memberRole="owner"
                permissions={{}}
              >
                {inputId === "round-notes" ? (
                  <ScheduleRoundDialogView
                    candidateId="candidate-1"
                    candidateName="测试候选人"
                    dependencies={scheduleDependencies}
                    passedRoundCount={0}
                    onOpenChange={vi.fn()}
                    onScheduled={vi.fn()}
                    open
                  />
                ) : (
                  <TransitionCandidateDialog
                    candidate={{ candidateName: "测试候选人", id: "candidate-1" }}
                    mode="reactivate"
                    onOpenChange={vi.fn()}
                    onCompleted={vi.fn()}
                    open
                  />
                )}
              </WorkspaceSlugProvider>
            </QueryClientProvider>,
          );
        });
        const input = document.querySelector<HTMLTextAreaElement>(`#${inputId}`);
        expect(input?.maxLength).toBe(500);
        expect(document.querySelector(`#${inputId}-limit`)?.textContent).toContain("0/500");
        const setValue = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value",
        )?.set;
        for (const length of [501, 500, 0]) {
          await act(() => {
            setValue?.call(input, "1".repeat(length));
            input?.dispatchEvent(new Event("input", { bubbles: true }));
          });
          expect(document.querySelector(`#${inputId}-limit`)?.textContent).toContain(
            `${length}/500`,
          );
          expect(input?.getAttribute("aria-invalid")).toBe(length > 500 ? "true" : null);
          if (length > 500) {
            expect(document.body.textContent).toContain("请缩减至 500 字以内");
            const submit = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
              (button) =>
                button.textContent === (inputId === "round-notes" ? "保存" : "确认重新激活"),
            );
            expect(submit?.disabled).toBe(true);
          }
          if (length === 500) {
            expect(document.body.textContent).toContain("已达字数上限");
          }
        }
      } finally {
        act(() => root.unmount());
        queryClient.clear();
        host.remove();
      }
    },
  );
});
