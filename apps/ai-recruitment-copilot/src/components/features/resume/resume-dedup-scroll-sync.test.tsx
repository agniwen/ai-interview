// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type * as ReactQuery from "@tanstack/react-query";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { enableReactActEnvironment, renderInAct, unmountInAct } from "@/test-utils/react-act";
import type { PDFViewerHandle } from "@/components/ui/pdf-viewer";
import { ResumeDedupCompareDialog } from "./resume-dedup-compare-dialog";

enableReactActEnvironment();

const queryState = vi.hoisted(() => ({ calls: 0 }));
const details = [
  {
    candidateEmail: null,
    candidateName: "当前候选人",
    candidatePhone: null,
    createdAt: "2026-07-24T08:00:00.000Z",
    id: "current-id",
    jobDescriptionName: null,
    resumeFileName: "current.pdf",
    resumeProfile: null,
    sourceLabel: "招聘台",
    sourceType: "studio_interview",
    statusLabel: "流程中",
    targetRole: null,
    uploaderImage: null,
    uploaderName: "当前上传人",
  },
  {
    candidateEmail: null,
    candidateName: "疑似候选人",
    candidatePhone: null,
    createdAt: "2026-07-25T08:00:00.000Z",
    id: "match-id",
    jobDescriptionName: null,
    resumeFileName: "match.pdf",
    resumeProfile: null,
    sourceLabel: "人才库",
    sourceType: "resume_pool_item",
    statusLabel: "有效",
    targetRole: null,
    uploaderImage: null,
    uploaderName: "疑似上传人",
  },
] as const;

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof ReactQuery>()),
  useQuery: () => {
    const detail = details[queryState.calls % details.length];
    queryState.calls += 1;
    return { data: detail, isError: false, isLoading: false };
  },
}));

vi.mock("@/lib/client/workspace-context", () => ({
  useWorkspaceSlug: () => "acme",
}));

vi.mock("@/lib/client/api", () => ({
  fetchResumePoolItem: vi.fn(),
  fetchStudioResume: vi.fn(),
}));

vi.mock("@/components/ui/modal", () => ({
  Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/pdf-viewer", async () => {
  const React = await import("react");
  return {
    PDFViewer: React.forwardRef<PDFViewerHandle, { file?: string }>(function MockPdfViewer(
      { file },
      ref,
    ) {
      const viewportRef = React.useRef<HTMLDivElement>(null);
      React.useImperativeHandle(
        ref,
        () => ({
          getViewportElement: () => viewportRef.current,
          scrollToPage: () => {},
          scrollToPageArea: () => {},
        }),
        [],
      );
      return (
        <div
          data-testid={`pdf-${file?.includes("current-id") ? "current" : "match"}`}
          ref={viewportRef}
        />
      );
    }),
  };
});

vi.mock("@/components/ui/docx-viewer", () => ({
  DocxViewerPreview: () => null,
}));

vi.mock("@/components/ui/xlsx-viewer", () => ({
  XlsxViewerPreview: () => null,
}));

vi.mock("@/components/features/resume/resume-profile-view", () => ({
  ResumeProfileView: () => null,
}));

vi.mock("./resume-document-preview-dialog", () => ({
  ImageResumePreviewContent: () => null,
}));

const roots: Awaited<ReturnType<typeof renderInAct>>["root"][] = [];

afterEach(async () => {
  for (const root of roots) {
    await unmountInAct(root);
  }
  roots.length = 0;
});

function setScrollMetrics(element: HTMLElement, scrollHeight: number, clientHeight: number) {
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: clientHeight },
    scrollHeight: { configurable: true, value: scrollHeight },
  });
}

describe("ResumeDedupCompareDialog synchronized scrolling", () => {
  it.each(["detail", "resume"] as const)(
    "syncs %s by percentage, allows independent scrolling, and realigns from the current resume",
    async (mode) => {
      queryState.calls = 0;
      const queryClient = new QueryClient();
      const { root } = await renderInAct(
        <QueryClientProvider client={queryClient}>
          <ResumeDedupCompareDialog
            match={{
              candidateEmail: null,
              candidateName: "疑似候选人",
              candidatePhone: null,
              createdAt: "2026-07-25T08:00:00.000Z",
              id: "match-id",
              jobDescriptionName: null,
              resumeFileName: "match.pdf",
              sourceType: "resume_pool_item",
              status: "active",
              targetRole: null,
            }}
            mode={mode}
            onOpenChange={() => {}}
            open
            source={{
              candidateEmail: null,
              candidateName: "当前候选人",
              candidatePhone: null,
              createdAt: "2026-07-24T08:00:00.000Z",
              id: "current-id",
              jobDescriptionName: null,
              resumeFileName: "current.pdf",
              resumeProfileSnapshot: null,
              skills: [],
              sourceType: "studio_interview",
              targetRole: null,
            }}
          />
        </QueryClientProvider>,
      );
      roots.push(root);

      const current = document.querySelector<HTMLElement>(
        mode === "resume"
          ? '[data-testid="pdf-current"]'
          : '[data-resume-compare-scroll-container="current"]',
      );
      const match = document.querySelector<HTMLElement>(
        mode === "resume"
          ? '[data-testid="pdf-match"]'
          : '[data-resume-compare-scroll-container="match"]',
      );
      const checkbox = document.querySelector<HTMLElement>('[data-slot="checkbox"]');
      expect(current).toBeTruthy();
      expect(match).toBeTruthy();
      expect(checkbox).toBeTruthy();
      expect(document.body.textContent).toContain("同步滚动");
      if (!(current && match && checkbox)) {
        throw new Error("expected both PDF viewports and the sync checkbox");
      }

      setScrollMetrics(current, 1000, 200);
      setScrollMetrics(match, 2000, 200);

      current.scrollTop = 400;
      current.dispatchEvent(new Event("scroll"));
      expect(match.scrollTop).toBe(900);

      act(() => checkbox.click());
      current.scrollTop = 600;
      current.dispatchEvent(new Event("scroll"));
      expect(match.scrollTop).toBe(900);

      current.scrollTop = 200;
      match.scrollTop = 1200;
      act(() => checkbox.click());
      expect(match.scrollTop).toBe(450);

      match.scrollTop = 1350;
      match.dispatchEvent(new Event("scroll"));
      expect(current.scrollTop).toBe(600);
    },
  );
});
