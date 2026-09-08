// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceSlugProvider } from "@/lib/client/workspace-context";
import { OfferStagePanel } from "./offer-stage-panel";

// SAFETY: React's test-only act environment flag.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = vi
  .fn()
  .mockReturnValue({ addEventListener: vi.fn(), matches: false, removeEventListener: vi.fn() });

describe("Offer stage content", () => {
  it.each([
    ["income_proof", false, false],
    ["salary_negotiation", true, false],
    ["offer", true, true],
    ["background_check", true, true],
  ] as const)("%s displays cumulative stage content", (stage, expectations, settings) => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    queryClient.setQueryData(
      ["recruiting-materials", "acme", "candidate"],
      [
        {
          contentType: "application/pdf",
          createdAt: "2026-09-08T00:00:00Z",
          fileName: "流水.pdf",
          id: "file-1",
          sizeBytes: 1024,
        },
      ],
    );
    queryClient.setQueryData(["studio-resumes", "acme", "detail", "candidate"], {
      candidateExpectationsMeta: null,
    });
    queryClient.setQueryData(["offer-drafts", "acme", "candidate"], []);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      act(() =>
        root.render(
          <QueryClientProvider client={queryClient}>
            <WorkspaceSlugProvider id="org" slug="acme" memberRole="hr" permissions={{}}>
              <OfferStagePanel
                stage={stage}
                candidateId="candidate"
                candidateName="候选人"
                candidateEmail={null}
              />
            </WorkspaceSlugProvider>
          </QueryClientProvider>,
        ),
      );
      expect(host.textContent).toContain("流水附件");
      expect(host.textContent?.includes("候选人期望")).toBe(expectations);
      expect(host.textContent?.includes("Offer 设置")).toBe(settings);
      expect(host.textContent).not.toContain("版本");
      const createButton = [...host.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("创建 Offer"),
      );
      expect(Boolean(createButton)).toBe(stage === "offer");
      expect(Boolean(host.querySelector('[aria-label="上传附件"]'))).toBe(stage === "income_proof");
      expect(Boolean(host.querySelector('[aria-label="删除 流水.pdf"]'))).toBe(
        stage === "income_proof",
      );
      expect(host.querySelector("a[download]")).not.toBeNull();
      expect(
        [...host.querySelectorAll("button")].some((button) => button.textContent === "编辑"),
      ).toBe(stage === "salary_negotiation");
    } finally {
      act(() => root.unmount());
      queryClient.clear();
      host.remove();
    }
  });
});
