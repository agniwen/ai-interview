// @vitest-environment jsdom

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ResumePoolListRecord } from "@arc/shared/resume-pool";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResumePoolCard, getResumePoolCardHeight } from "../resume-pool-card";
import {
  ResumePoolDetailSummaryPanel,
  canManageResumePoolJobBinding,
} from "../resume-pool-details";
import { uploaderMetaLabel } from "../resume-pool-page-model";

// SAFETY: React's test environment flag is intentionally attached to globalThis.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

const record = {
  candidateEmail: "candidate@example.com",
  candidateName: "测试候选人",
  candidatePhone: "13800138000",
  createdAt: "2026-07-31T00:00:00.000Z",
  createdBy: "user-1",
  duplicateMatch: null,
  id: "resume-pool-1",
  importedAt: null,
  importedRecords: [],
  importedResumeRecordId: null,
  jobBindingMode: null,
  jobDescriptionId: "jd-product",
  jobDescriptionName: "AI 产品经理",
  masteredSkills: Array.from({ length: 12 }, (_, index) => `技能 ${index + 1}`),
  notes: "具备完整的 AI 招聘产品设计与落地经验。",
  organizationId: "organization-1",
  profileHighlights: {
    educationItems: [],
    educationLines: [],
    latestCompany: "极光矩阵",
    latestCompanyDetail: {
      period: "2025.02-至今",
      role: "前端工程师",
      summary: "负责 AI 招聘产品前端。",
    },
    latestProject: "智能招聘看板",
    latestProjectDetail: {
      period: "2025.01-2025.05",
      role: "负责人",
      summary: "负责候选人数据分析与可视化。",
    },
    personalStrengths: ["擅长复杂招聘产品的设计与落地。", "能够推动跨团队协作"],
    schools: [],
  },
  publishedAt: null,
  publishedBy: null,
  resumeContentHash: null,
  resumeFileName: "测试候选人.pdf",
  resumeParseError: null,
  resumeParseRetryable: false,
  resumeParseStatus: "ready",
  resumeParsedAt: null,
  resumeProfileSnapshot: {
    education: [
      {
        period: "2018.09 - 2022.06",
        primary: "上海交通大学",
        secondary: "计算机科学",
      },
    ],
    educationHasMore: false,
    projects: [],
    projectsHasMore: false,
    work: [
      {
        period: "2025.02 - 至今",
        primary: "极光矩阵",
        secondary: "前端工程师",
      },
    ],
    workHasMore: false,
  },
  resumeStorageKey: "resumes/test.pdf",
  scope: "public",
  skillsNormalized: [],
  sourceChannel: "mail_ingest",
  sourceOrganizationId: null,
  sourcePoolItemId: null,
  sourceUserId: null,
  status: "active",
  targetRole: "AI 产品经理",
  updatedAt: "2026-07-31T00:00:00.000Z",
  uploaderEmail: "recruiter@example.com",
  uploaderImage: "https://example.com/recruiter.png",
  uploaderName: "王敏",
  uploaderOrganizationName: null,
  workYears: 5,
} satisfies ResumePoolListRecord;

describe("ResumePoolCard", () => {
  it("matches the recruitment-desk information rhythm and only renders two actions", () => {
    const html = renderToStaticMarkup(
      <ResumePoolCard
        canEnterRecruiting={true}
        enteringRecruiting={false}
        onEnterRecruiting={() => {}}
        onOpenDetail={() => {}}
        record={record}
      />,
    );

    expect(html).toContain("测试候选人");
    expect(html).not.toContain("AI 产品经理-5年-测试候选人");
    expect(html).toContain("AI 产品经理");
    expect(html).toContain("王敏");
    expect(html).toContain("极光矩阵");
    expect(html).toContain("上海交通大学");
    expect(html).toContain("擅长复杂招聘产品的设计与落地；能够推动跨团队协作");
    expect(html).not.toContain("负责 AI 招聘产品前端。");
    expect(html).not.toContain("具备完整的 AI 招聘产品设计与落地经验。");
    expect(html).toContain('data-slot="avatar-fallback"');
    expect(html).toContain("技能 6");
    expect(html).not.toContain("技能 7");

    const actionLabels = [...html.matchAll(/data-resume-pool-card-action="([^"]+)"/gu)].map(
      (match) => match[1],
    );
    expect(actionLabels).toEqual(["详情", "进入招聘"]);
    expect(html).not.toContain("推荐岗位");
    expect(html).not.toContain("更换");
    expect(html).not.toContain("删除");
  });

  it("places the uploader's real avatar immediately before the uploader name", async () => {
    const cardSource = await readFile(
      resolve("src/components/features/studio/resume-pool/resume-pool-card.tsx"),
      "utf-8",
    );

    expect(cardSource).toContain("<AvatarImage");
    expect(cardSource).toContain("src={record.uploaderImage}");
    expect(cardSource.indexOf("<AvatarImage")).toBeLessThan(
      cardSource.indexOf("{segments.userName}</span>"),
    );
  });

  it("invokes detail and recruiting actions without triggering the card click twice", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onEnterRecruiting = vi.fn();
    const onOpenDetail = vi.fn();

    act(() => {
      root.render(
        <ResumePoolCard
          canEnterRecruiting={true}
          enteringRecruiting={false}
          onEnterRecruiting={onEnterRecruiting}
          onOpenDetail={onOpenDetail}
          record={record}
        />,
      );
    });

    act(() => {
      document.querySelector<HTMLButtonElement>('[aria-label="查看人才详情"]')?.click();
    });
    expect(onOpenDetail).toHaveBeenCalledTimes(1);

    act(() => {
      document.querySelector<HTMLButtonElement>('[aria-label="进入招聘"]')?.click();
    });
    expect(onEnterRecruiting).toHaveBeenCalledTimes(1);
    expect(onOpenDetail).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
  });

  it("uses fixed virtual-row heights for every responsive breakpoint", () => {
    expect(getResumePoolCardHeight(390)).toBe(356);
    expect(getResumePoolCardHeight(640)).toBe(308);
    expect(getResumePoolCardHeight(768)).toBe(286);
    expect(getResumePoolCardHeight(1024)).toBe(246);
    expect(getResumePoolCardHeight(1280)).toBe(220);
    expect(getResumePoolCardHeight(1536)).toBe(218);
  });

  it("labels mail-ingested resumes as an email scan", () => {
    expect(
      uploaderMetaLabel({
        ...record,
        sourceChannel: "mail_ingest",
      }),
    ).toBe("26年07月31日:08:00 扫描王敏邮箱录入");
  });

  it("renders a candidate conclusion as typeset markdown", () => {
    const html = renderToStaticMarkup(
      <ResumePoolDetailSummaryPanel
        detail={{
          ...record,
          jobDescriptionId: null,
          jobDescriptionName: null,
          notes: "**候选人结论**\n\n- 核心能力匹配岗位",
        }}
        isError={false}
        isLoading={false}
        resumeProfile={null}
        slug="default"
      />,
    );

    expect(html).toContain("typeset typeset-compact");
    expect(html).toContain("<strong>候选人结论</strong>");
    expect(html).toContain("<li>核心能力匹配岗位</li>");
  });

  it("denies job recommendation actions without permission", () => {
    expect(
      canManageResumePoolJobBinding({
        canRecommend: false,
        currentUserId: "user-1",
        detail: record,
      }),
    ).toBe(false);
  });

  it("denies job recommendation actions for another user's private resume", () => {
    expect(
      canManageResumePoolJobBinding({
        canRecommend: true,
        currentUserId: "user-2",
        detail: { ...record, scope: "private" },
      }),
    ).toBe(false);
  });
});
