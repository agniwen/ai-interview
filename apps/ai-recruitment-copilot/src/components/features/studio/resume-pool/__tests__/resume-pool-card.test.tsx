// @vitest-environment jsdom

import type { ResumePoolListRecord } from "@arc/shared/resume-pool";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceSlugProvider } from "@/lib/client/workspace-context";

import { canManageResumePoolJobBinding, ResumePoolCard } from "../resume-pool-details";
import { uploaderMetaLabel } from "../resume-pool-page-model";

// SAFETY: React's test environment flag is intentionally attached to globalThis.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

const record = {
  candidateEmail: null,
  candidateName: "测试候选人",
  candidatePhone: null,
  createdAt: "2026-07-31T00:00:00.000Z",
  createdBy: "user-1",
  duplicateMatch: null,
  id: "resume-pool-1",
  importedAt: null,
  importedRecords: [],
  importedResumeRecordId: null,
  jobBindingMode: null,
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

function renderCard(card: ReactElement) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <WorkspaceSlugProvider id="org-1" memberRole="admin" permissions={{}} slug="test-workspace">
        {card}
      </WorkspaceSlugProvider>
    </QueryClientProvider>,
  );
}

describe("ResumePoolCard", () => {
  it("shows nine skills and detailed latest company and project information", () => {
    const html = renderCard(
      <ResumePoolCard
        canDelete={false}
        canImport={false}
        canPublish={false}
        canRecommend={true}
        canRetryParse={false}
        deleting={false}
        onDelete={() => {}}
        onImport={() => {}}
        onOpenDetail={() => {}}
        onOpenDuplicateMatches={() => {}}
        onOpenPdf={() => {}}
        onPublish={() => {}}
        onBindJobDescription={() => {}}
        onRetryParse={() => {}}
        onSelectionChange={() => {}}
        publishing={false}
        record={{ ...record, uploaderName: "王敏" }}
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
    expect(html).toContain("王敏 26年07月31日:08:00 上传");
    expect(html).toContain("推荐岗位");
  });

  it("labels mail-ingested resumes as an email scan", () => {
    expect(
      uploaderMetaLabel({
        ...record,
        sourceChannel: "mail_ingest",
        uploaderName: "王敏",
      }),
    ).toBe("26年07月31日:08:00 扫描王敏邮箱录入");
  });

  it("shows text labels for the target role and bound job", () => {
    const html = renderCard(
      <ResumePoolCard
        canDelete={false}
        canImport={false}
        canPublish={false}
        canRecommend={true}
        canRetryParse={false}
        deleting={false}
        onDelete={() => {}}
        onImport={() => {}}
        onOpenDetail={() => {}}
        onOpenDuplicateMatches={() => {}}
        onOpenPdf={() => {}}
        onPublish={() => {}}
        onBindJobDescription={() => {}}
        onRetryParse={() => {}}
        onSelectionChange={() => {}}
        publishing={false}
        record={{
          ...record,
          jobBindingMode: "automatic",
          jobDescriptionId: "jd-commercial-operations",
          targetRole: "内容运营",
          workYears: 7,
        }}
        retrying={false}
        scope="public"
        selected={false}
        selectionDisabled={false}
      />,
    );

    expect(html).toContain("目标岗位：");
    expect(html).toContain("内容运营");
    expect(html).toContain("工作年限：");
    expect(html).toContain("7 年");
    expect(html).toContain("绑定岗位：");
    expect(html).toContain("已绑定");
    expect(html).not.toContain("自动匹配");
    expect(html).toContain("更换");
    expect(html).toContain('aria-haspopup="menu"');
    expect(html.indexOf("目标岗位：")).toBeLessThan(html.indexOf("绑定岗位："));
  });

  it("opens a job dropdown with the existing matching result", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onBindJobDescription = vi.fn();
    const queryClient = new QueryClient();
    queryClient.setQueryData(["resume-pool", "job-match", "test-workspace", record.id], {
      candidates: [
        {
          aiRank: 1,
          aiReason: "当前最匹配",
          aiScore: 92,
          available: true,
          code: null,
          departmentName: "商业化",
          id: "jd-commercial-operations",
          isCurrent: true,
          name: "商业化运营",
          recallRank: 1,
          vectorScore: 0.91,
        },
        {
          aiRank: 2,
          aiReason: "内容经验匹配",
          aiScore: 86,
          available: true,
          code: null,
          departmentName: "内容部",
          id: "jd-content",
          isCurrent: false,
          name: "内容运营",
          recallRank: 2,
          vectorScore: 0.84,
        },
        ...Array.from({ length: 5 }, (_, index) => ({
          aiRank: index + 3,
          aiReason: `候选岗位 ${index + 3} 的匹配说明`,
          aiScore: 80 - index,
          available: true,
          code: null,
          departmentName: "候选部门",
          id: `jd-candidate-${index + 3}`,
          isCurrent: false,
          name: `候选岗位 ${index + 3}`,
          recallRank: index + 3,
          vectorScore: 0.8 - index / 100,
        })),
      ],
      createdAt: "2026-07-31T00:00:00.000Z",
      id: "match-run-1",
      selectedJobDescriptionId: "jd-commercial-operations",
      selectionMethod: "ai",
      status: "completed",
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <WorkspaceSlugProvider
            id="org-1"
            memberRole="admin"
            permissions={{}}
            slug="test-workspace"
          >
            <ResumePoolCard
              canDelete={false}
              canImport={false}
              canPublish={false}
              canRecommend={true}
              canRetryParse={false}
              deleting={false}
              onBindJobDescription={onBindJobDescription}
              onDelete={() => {}}
              onImport={() => {}}
              onOpenDetail={() => {}}
              onOpenDuplicateMatches={() => {}}
              onOpenPdf={() => {}}
              onPublish={() => {}}
              onRetryParse={() => {}}
              onSelectionChange={() => {}}
              publishing={false}
              record={{
                ...record,
                jobBindingMode: "automatic",
                jobDescriptionId: "jd-commercial-operations",
                jobDescriptionName: null,
              }}
              retrying={false}
              scope="public"
              selected={false}
              selectionDisabled={false}
            />
          </WorkspaceSlugProvider>
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    const trigger = document.querySelector<HTMLButtonElement>('[aria-label="更换绑定岗位"]');
    expect(trigger).not.toBeNull();

    await act(async () => {
      trigger?.click();
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("内容运营");
    expect(document.body.textContent).toContain("内容部 · 内容经验匹配");
    expect(document.body.textContent).not.toContain("候选岗位 7");
    expect(document.body.textContent).not.toContain("自动匹配");

    const options = [...document.querySelectorAll<HTMLElement>('[data-slot="dropdown-menu-item"]')];
    expect(options).toHaveLength(5);
    const option = options.find((item) => item.textContent?.includes("内容运营"));
    expect(option).toBeDefined();
    expect(option?.querySelector('[data-slot="item-title"]')?.textContent).toBe("内容运营");
    expect(option?.querySelector('[data-slot="item-description"]')?.textContent).toBe(
      "内容部 · 内容经验匹配",
    );

    await act(async () => {
      option?.click();
      await Promise.resolve();
    });

    expect(onBindJobDescription).toHaveBeenCalledWith(
      expect.objectContaining({ id: record.id }),
      "jd-content",
    );

    act(() => root.unmount());
    queryClient.clear();
    container.remove();
  });

  it("opens at most five generated recommendations from a secondary dropdown", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onBindJobDescription = vi.fn();
    const queryClient = new QueryClient();
    queryClient.setQueryData(["resume-pool", "job-match", "test-workspace", record.id], null);
    queryClient.setQueryData(["resume-pool", "jd-recommendations", "test-workspace", record.id], {
      diagnostics: { aboveThresholdCount: 6, eligibleCount: 6, vectorHitCount: 6 },
      recommendations: Array.from({ length: 6 }, (_, index) => ({
        departmentName: "产品部",
        description: `推荐岗位 ${index + 1} 的岗位描述`,
        id: `jd-recommended-${index + 1}`,
        name: `推荐岗位 ${index + 1}`,
        reasons: [`推荐岗位 ${index + 1} 的匹配理由`],
        score: 90 - index,
        similarity: {},
      })),
      resume: { id: record.id },
      status: "ready",
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <WorkspaceSlugProvider
            id="org-1"
            memberRole="admin"
            permissions={{}}
            slug="test-workspace"
          >
            <ResumePoolCard
              canDelete={false}
              canImport={false}
              canPublish={false}
              canRecommend={true}
              canRetryParse={false}
              deleting={false}
              onBindJobDescription={onBindJobDescription}
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
            />
          </WorkspaceSlugProvider>
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    const trigger = document.querySelector<HTMLButtonElement>('[aria-label="推荐岗位"]');
    expect(trigger?.dataset.variant).toBe("secondary");

    await act(async () => {
      trigger?.click();
      await Promise.resolve();
    });

    const options = [...document.querySelectorAll<HTMLElement>('[data-slot="dropdown-menu-item"]')];
    expect(options).toHaveLength(5);
    expect(document.body.textContent).toContain("产品部 · 推荐岗位 1 的岗位描述");
    expect(document.body.textContent).not.toContain("推荐岗位 6");

    await act(async () => {
      options[0]?.click();
      await Promise.resolve();
    });

    expect(onBindJobDescription).toHaveBeenCalledWith(
      expect.objectContaining({ id: record.id }),
      "jd-recommended-1",
    );

    act(() => root.unmount());
    queryClient.clear();
    container.remove();
  });

  it("offers an enabled reimport action for an imported resume", () => {
    const html = renderCard(
      <ResumePoolCard
        canDelete={false}
        canImport={true}
        canPublish={false}
        canRecommend={true}
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
    const reimportButton = html.match(/<button[^>]*aria-label="再次创建招聘记录"[^>]*>/u)?.[0];

    expect(reimportButton).toBeDefined();
    expect(reimportButton).not.toMatch(/\sdisabled(?:=|\s|>)/u);
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
