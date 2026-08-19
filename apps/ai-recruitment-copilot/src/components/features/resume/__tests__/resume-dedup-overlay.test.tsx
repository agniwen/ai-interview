// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
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
import type { ResumeDedupMatchListDependencies } from "../resume-dedup-overlay";

enableReactActEnvironment();
installNoopResizeObserver();
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: (media: string): MediaQueryList => ({
    addEventListener: () => {},
    addListener: () => {},
    dispatchEvent: () => false,
    matches: false,
    media,
    onchange: null,
    removeEventListener: () => {},
    removeListener: () => {},
  }),
});

const dependencies: ResumeDedupMatchListDependencies = {
  renderComparison: ({ mode }) => <div data-testid="resume-dedup-compare">{mode}</div>,
};

const roots: Awaited<ReturnType<typeof renderInAct>>["root"][] = [];

afterEach(async () => {
  for (const root of roots) {
    await unmountInAct(root);
  }
  roots.length = 0;
});

describe("ResumeDuplicateMatchesDialog", () => {
  it("shows uploader avatars and names for the current candidate and suspected records", async () => {
    const queryClient = new QueryClient();
    const { root } = await renderInAct(
      <QueryClientProvider client={queryClient}>
        <ResumeDuplicateMatchesDialog
          dependencies={dependencies}
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

  it("shows who created the latest earlier duplicate and when", async () => {
    const { root } = await renderInAct(
      <ResumeDuplicateMatchBadge
        duplicateMatch={{
          count: 1,
          highestLevel: "high",
          latestDuplicate: {
            candidateName: "重复候选人",
            createdAt: "2026-08-18T04:20:00.000Z",
            creatorName: "荷叶",
          },
        }}
        sourceCreatedAt="2026-08-19T04:20:00.000Z"
      />,
    );
    roots.push(root);

    expect(document.querySelector('[data-slot="badge"]')?.textContent).toBe(
      "重复简历，荷叶于 26/08/18 12:20 创建",
    );
  });

  it("marks the latest duplicate when it was created after the current resume", async () => {
    const { root } = await renderInAct(
      <ResumeDuplicateMatchBadge
        duplicateMatch={{
          count: 2,
          highestLevel: "high",
          latestDuplicate: {
            candidateName: "稍后重复候选人",
            createdAt: "2026-08-20T04:20:00.000Z",
            creatorName: "达里尔",
          },
        }}
        sourceCreatedAt="2026-08-19T04:20:00.000Z"
      />,
    );
    roots.push(root);

    expect(document.querySelector('[data-slot="badge"]')?.textContent).toBe(
      "重复简历 2 条，达里尔创建，晚于当前简历创建",
    );
  });

  // 产品决策：查重查看忽略 resumeLibrary/resumePool 读权限配置 ——
  // 即使当前用户没有某一侧的读权限，详情/简历对照入口依然可见可用。
  it("keeps cross-resource comparison actions without read permission", async () => {
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

    expect(document.body.textContent).toContain("详情");
    expect(document.body.textContent).toContain("简历");
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

  it("annotates each suspected record's creation time relative to the current resume", async () => {
    const { root } = await renderInAct(
      <ResumeDedupMatchList
        matches={[
          {
            candidateEmail: null,
            candidateName: "早加入的疑似",
            candidatePhone: null,
            createdAt: "2026-07-24T00:00:00.000Z",
            id: "earlier-id",
            jobDescriptionName: null,
            resumeFileName: "earlier.pdf",
            sourceType: "studio_interview",
            status: "active",
            targetRole: null,
          },
          {
            candidateEmail: null,
            candidateName: "晚加入的疑似",
            candidatePhone: null,
            createdAt: "2026-07-26T00:00:00.000Z",
            id: "later-id",
            jobDescriptionName: null,
            resumeFileName: "later.pdf",
            sourceType: "studio_interview",
            status: "active",
            targetRole: null,
          },
        ]}
        source={{
          candidateEmail: null,
          candidateName: "当前候选人",
          candidatePhone: null,
          createdAt: "2026-07-25T00:00:00.000Z",
          id: "current-id",
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

    const earlierLabel = [...document.querySelectorAll("span")].find(
      (element) => element.textContent === "比当前简历加入早",
    );
    const laterLabel = [...document.querySelectorAll("span")].find(
      (element) => element.textContent === "比当前简历加入晚",
    );
    expect(earlierLabel?.className).toContain("text-red-600");
    expect(laterLabel?.className).toContain("text-green-600");
  });

  it("shows the current recruiting status badge for resume-library matches", async () => {
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
            pipelineStatus: { label: "AI 面试 · 第 2/2 轮 · 进行中", tone: "warning" },
            resumeFileName: "suspected.pdf",
            sourceType: "studio_interview",
            status: "active",
            targetRole: null,
          },
        ]}
        source={{
          candidateEmail: null,
          candidateName: "当前候选人",
          candidatePhone: null,
          createdAt: "2026-07-25T00:00:00.000Z",
          id: "current-id",
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

    expect(document.body.textContent).toContain("AI 面试 · 第 2/2 轮 · 进行中");
    // 招聘台记录用状态 badge 取代通用「有效」文案。
    expect(document.body.textContent).not.toContain("· 有效");
  });
});
