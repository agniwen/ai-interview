// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScheduleRoundDialog } from "./human-interview-stage-dialogs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/client/workspace-context", () => ({
  useWorkspaceSlug: () => "test-workspace",
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("ScheduleRoundDialog", () => {
  it("shows workspace member avatars in the interviewer list", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(["workspace-members", "test-workspace"], {
      records: [
        {
          email: "guang@example.com",
          id: "member-1",
          image: "https://example.com/guang.png",
          name: "光芒",
        },
        {
          email: "zhang@example.com",
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
          <ScheduleRoundDialog
            candidateId="candidate-1"
            candidateName="候选人"
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

    act(() => root.unmount());
    queryClient.clear();
    host.remove();
  });
});
