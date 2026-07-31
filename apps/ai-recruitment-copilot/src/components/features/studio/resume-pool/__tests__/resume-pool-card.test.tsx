import type { ResumePoolListRecord } from "@arc/shared/resume-pool";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ResumePoolCard } from "../resume-pool-details";

vi.mock("@/lib/client/workspace-context", () => ({
  useWorkspaceSlug: () => "test-workspace",
}));

const record = {
  candidateEmail: null,
  candidateName: "测试候选人",
  candidatePhone: null,
  createdAt: "2026-07-31T00:00:00.000Z",
  createdBy: "user-1",
  duplicateMatch: null,
  id: "resume-pool-1",
  importedAt: null,
  importedResumeRecordId: null,
  jobDescriptionId: null,
  jobDescriptionName: null,
  masteredSkills: Array.from({ length: 12 }, (_, index) => `技能 ${index + 1}`),
  notes: null,
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
    schools: [],
  },
  publishedAt: null,
  publishedBy: null,
  resumeContentHash: null,
  resumeFileName: null,
  resumeParseError: null,
  resumeParseRetryable: false,
  resumeParseStatus: "ready",
  resumeParsedAt: null,
  resumeProfileSnapshot: {
    education: [],
    educationHasMore: false,
    projects: [],
    projectsHasMore: false,
    work: [],
    workHasMore: false,
  },
  resumeStorageKey: null,
  scope: "public",
  skillsNormalized: [],
  sourceChannel: null,
  sourceOrganizationId: null,
  sourcePoolItemId: null,
  sourceUserId: null,
  status: "active",
  targetRole: null,
  updatedAt: "2026-07-31T00:00:00.000Z",
  uploaderEmail: null,
  uploaderImage: null,
  uploaderName: null,
  uploaderOrganizationName: null,
  workYears: null,
} satisfies ResumePoolListRecord;

describe("ResumePoolCard", () => {
  it("shows nine skills and detailed latest company and project information", () => {
    const html = renderToStaticMarkup(
      <ResumePoolCard
        canDelete={false}
        canImport={false}
        canPublish={false}
        canRetryParse={false}
        deleting={false}
        onDelete={() => {}}
        onImport={() => {}}
        onOpenDetail={() => {}}
        onOpenDuplicateMatches={() => {}}
        onOpenPdf={() => {}}
        onPublish={() => {}}
        onRetryParse={() => {}}
        onSelectionChange={() => {}}
        publishing={false}
        record={record}
        retrying={false}
        scope="public"
        selected={false}
        selectionDisabled={false}
      />,
    );

    expect(html).toContain("技能 9");
    expect(html).not.toContain("技能 10");
    expect(html).toContain("+3");
    expect(html).toContain("前端工程师");
    expect(html).toContain("2025.02-至今");
    expect(html).toContain("负责 AI 招聘产品前端。");
    expect(html).toContain("负责人");
    expect(html).toContain("2025.01-2025.05");
    expect(html).toContain("负责候选人数据分析与可视化。");
  });

  it("offers an enabled reimport action for an imported resume", () => {
    const html = renderToStaticMarkup(
      <ResumePoolCard
        canDelete={false}
        canImport={true}
        canPublish={false}
        canRetryParse={false}
        deleting={false}
        onDelete={() => {}}
        onImport={() => {}}
        onOpenDetail={() => {}}
        onOpenDuplicateMatches={() => {}}
        onOpenPdf={() => {}}
        onPublish={() => {}}
        onRetryParse={() => {}}
        onSelectionChange={() => {}}
        publishing={false}
        record={{ ...record, importedResumeRecordId: "resume-record-1" }}
        retrying={false}
        scope="public"
        selected={false}
        selectionDisabled={false}
      />,
    );
    const reimportButton = html.match(/<button[^>]*aria-label="再次入库"[^>]*>/u)?.[0];

    expect(reimportButton).toBeDefined();
    expect(reimportButton).not.toMatch(/\sdisabled(?:=|\s|>)/u);
  });
});
