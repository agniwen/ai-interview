// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScheduleRoundDialogView } from "./human-interview-stage-dialogs";

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
});

describe("ScheduleRoundDialog", () => {
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
            existingCount={0}
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
            existingCount={0}
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
