// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import {
  enableReactActEnvironment,
  installNoopResizeObserver,
  renderInAct,
  unmountInAct,
} from "@/test-utils/react-act";
import { ResumeDuplicateMatchBadge } from "../resume-duplicate-match-badge";
import { ResumeDedupMatchList, ResumeDuplicateMatchesDialog } from "../resume-dedup-overlay";

enableReactActEnvironment();
installNoopResizeObserver();

vi.mock("@/lib/client/workspace-context", () => ({
  useOptionalWorkspaceSlug: () => "default",
  useWorkspaceCan: () => false,
  useWorkspaceSlug: () => "default",
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

const permissionMocks = vi.hoisted(() => ({
  resumeLibrary: true,
  resumePool: true,
}));

vi.mock("@/hooks/use-has-permission", () => ({
  useHasPermission: (resource: "resumeLibrary" | "resumePool") => permissionMocks[resource],
}));

vi.mock("../resume-dedup-compare-dialog", () => ({
  ResumeDedupCompareDialog: ({ mode }: { mode: string }) => (
    <div data-testid="resume-dedup-compare">{mode}</div>
  ),
}));

const roots: Awaited<ReturnType<typeof renderInAct>>["root"][] = [];

afterEach(async () => {
  for (const root of roots) {
    await unmountInAct(root);
  }
  roots.length = 0;
  permissionMocks.resumeLibrary = true;
  permissionMocks.resumePool = true;
});

describe("ResumeDuplicateMatchesDialog", () => {
  it("shows uploader avatars and names for the current candidate and suspected records", async () => {
    const queryClient = new QueryClient();
    const { root } = await renderInAct(
      <QueryClientProvider client={queryClient}>
        <ResumeDuplicateMatchesDialog
          matches={[
            {
              candidateEmail: "suspected@example.com",
              candidateName: "疑似候选人",
              candidatePhone: null,
              createdAt: "2026-07-24T00:00:00.000Z",
              id: "suspected-id",
              jobDescriptionName: null,
              level: "high",
              resumeFileName: "suspected.pdf",
              score: 94,
              status: "active",
              targetRole: null,
              uploaderImage: "https://example.com/suspected.png",
              uploaderName: "疑似上传人",
            },
          ]}
          onOpenChange={() => {}}
          open
          source={{
            candidateEmail: "current@example.com",
            candidateName: "当前候选人",
            candidatePhone: null,
            createdAt: "2026-07-24T00:00:00.000Z",
            id: "current-id",
            jobDescriptionName: null,
            resumeFileName: "current.pdf",
            resumeProfileSnapshot: null,
            skills: [],
            targetRole: null,
            uploaderImage: "https://example.com/current.png",
            uploaderName: "当前上传人",
          }}
        />
      </QueryClientProvider>,
    );
    roots.push(root);

    expect(document.body.textContent).toContain("上传人");
    expect(document.body.textContent).toContain("当前上传人");
    expect(document.body.textContent).toContain("疑似上传人");
    const riskBadge = [...document.querySelectorAll<HTMLElement>('[data-slot="badge"]')].find(
      (element) => element.textContent === "高度疑似 94%",
    );
    expect(riskBadge).toBeTruthy();
    expect(riskBadge?.className).toContain("rounded-sm");
    expect(riskBadge?.className).toContain("px-2.5");
    expect(riskBadge?.className).toContain("py-1");
    expect(riskBadge?.className).toContain("font-normal");
    expect(riskBadge?.className).not.toContain("px-1.5");
    expect(riskBadge?.className).not.toContain("py-0.5");
    const uploaderLabel = [...document.querySelectorAll("span")].find(
      (element) => element.textContent === "上传人",
    );
    expect(uploaderLabel?.parentElement?.className).toContain("grid-cols-[3rem_minmax(0,1fr)]");
    expect(uploaderLabel?.parentElement?.className).toContain("gap-x-2");
    const avatars = document.querySelectorAll<HTMLElement>('[data-slot="avatar"]');
    expect(avatars.length).toBeGreaterThanOrEqual(2);
    for (const avatar of avatars) {
      expect(avatar.className).toContain("size-4");
      expect(avatar.dataset.size).toBe("default");
    }
    const detailButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "详情",
    );
    const resumeButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "简历",
    );
    expect(detailButton?.parentElement?.className).toContain("hidden");
    expect(detailButton?.parentElement?.className).toContain("lg:flex");
    expect(resumeButton).toBeTruthy();

    await act(async () => {
      detailButton?.click();
      await Promise.resolve();
    });
    expect(document.querySelector('[data-testid="resume-dedup-compare"]')?.textContent).toBe(
      "detail",
    );

    await act(async () => {
      resumeButton?.click();
      await Promise.resolve();
    });
    expect(document.querySelector('[data-testid="resume-dedup-compare"]')?.textContent).toBe(
      "resume",
    );
  });

  it("uses the same padding and font weight as the resume lifecycle badge", async () => {
    const { root } = await renderInAct(
      <ResumeDuplicateMatchBadge
        duplicateMatch={{
          count: 2,
          highestLevel: "high",
        }}
      />,
    );
    roots.push(root);

    const badge = document.querySelector<HTMLElement>('[data-slot="badge"]');
    expect(badge?.className).toContain("px-2.5");
    expect(badge?.className).toContain("py-1");
    expect(badge?.className).toContain("font-normal");
  });

  it("hides cross-resource comparison actions without permission to read both sides", async () => {
    permissionMocks.resumeLibrary = false;
    const { root } = await renderInAct(
      <ResumeDedupMatchList
        matches={[
          {
            candidateEmail: null,
            candidateName: "招聘台候选人",
            candidatePhone: null,
            createdAt: "2026-07-24T00:00:00.000Z",
            id: "studio-1",
            jobDescriptionName: null,
            resumeFileName: "suspected.pdf",
            sourceType: "studio_interview",
            status: "active",
            targetRole: null,
          },
        ]}
        source={{
          candidateEmail: null,
          candidateName: "人才库候选人",
          candidatePhone: null,
          id: "pool-1",
          jobDescriptionName: null,
          resumeFileName: "current.pdf",
          resumeProfileSnapshot: null,
          skills: [],
          sourceType: "resume_pool_item",
          targetRole: null,
        }}
      />,
    );
    roots.push(root);

    expect(document.body.textContent).not.toContain("详情");
    expect(document.body.textContent).not.toContain("简历");
  });

  it("keeps detail comparison but hides resume comparison for unsupported files", async () => {
    const { root } = await renderInAct(
      <ResumeDedupMatchList
        matches={[
          {
            candidateEmail: null,
            candidateName: "旧格式候选人",
            candidatePhone: null,
            createdAt: "2026-07-24T00:00:00.000Z",
            id: "studio-2",
            jobDescriptionName: null,
            resumeFileName: "legacy.doc",
            sourceType: "studio_interview",
            status: "active",
            targetRole: null,
          },
        ]}
        source={{
          candidateEmail: null,
          candidateName: "当前候选人",
          candidatePhone: null,
          id: "studio-1",
          jobDescriptionName: null,
          resumeFileName: "current.pdf",
          resumeProfileSnapshot: null,
          skills: [],
          sourceType: "studio_interview",
          targetRole: null,
        }}
      />,
    );
    roots.push(root);

    expect(document.body.textContent).toContain("详情");
    expect(document.body.textContent).not.toContain("简历");
  });
});
