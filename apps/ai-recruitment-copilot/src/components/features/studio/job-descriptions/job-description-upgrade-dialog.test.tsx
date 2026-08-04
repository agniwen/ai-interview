// @vitest-environment jsdom

import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultJobDescriptionStructuredConfig } from "@arc/db-schema/job-description-structured-config";
import { createDefaultResumeScreeningPolicy } from "@arc/shared/job-descriptions";
import type { JobDescriptionRecord } from "@arc/shared/job-descriptions";
import { JobDescriptionUpgradeDialog } from "./job-description-upgrade-dialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fixtures = vi.hoisted(() => ({
  draft: null as Record<string, unknown> | null,
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useQuery: () => ({
    data: fixtures.draft,
    error: null,
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  }),
  useQueryClient: () => ({ removeQueries: vi.fn(), setQueryData: vi.fn() }),
}));

vi.mock("@/lib/client/workspace-context", () => ({
  useWorkspaceSlug: () => "workspace",
}));

vi.mock("@/lib/client/rpc", () => ({ rpc: { api: {} } }));

vi.mock("@/components/ui/modal", () => ({
  Modal: ({
    children,
    footer,
    title,
  }: {
    children: ReactNode;
    footer: ReactNode;
    title: string;
  }) => (
    <div>
      <h1>{title}</h1>
      {children}
      {footer}
    </div>
  ),
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogAction: ({ children }: { children: ReactNode }) => <button>{children}</button>,
  AlertDialogCancel: ({ children }: { children: ReactNode }) => <button>{children}</button>,
  AlertDialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("./job-description-structured-fields", () => ({
  JobDescriptionStructuredFields: () => <div data-testid="structured-fields">结构化设置</div>,
}));

vi.mock("./job-evaluation-blueprint-preview", () => ({
  JobEvaluationBlueprintPreview: () => <div>评分规则预览</div>,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const structuredConfig = createDefaultJobDescriptionStructuredConfig();

const record: JobDescriptionRecord = {
  allowCrossDepartmentInterviewers: false,
  code: "JOB0001",
  createdAt: new Date(),
  createdBy: "user-1",
  deductionRuleSetVersion: null,
  departmentId: "department-1",
  description: "旧版岗位描述",
  evaluationBlueprint: null,
  evaluationBlueprintHash: null,
  evaluationBlueprintPreview: null,
  evaluationBlueprintPreviewGeneratedAt: null,
  evaluationBlueprintPreviewHash: null,
  evaluationBlueprintPreviewInputHash: null,
  evaluationBlueprintSchemaVersion: null,
  evaluationMode: "legacy",
  evaluationUpgradedAt: null,
  evaluationUpgradedBy: null,
  hasEvaluationUpgradeDraft: true,
  id: "job-1",
  interviewerIds: ["interviewer-1"],
  lifecycleStatus: "published",
  name: "旧版岗位",
  presetQuestions: [],
  prompt: "旧版岗位 Prompt",
  publishedAt: new Date(),
  resumeScreeningPolicy: createDefaultResumeScreeningPolicy(),
  resumeScreeningPolicyHash: null,
  resumeScreeningPolicyVersion: 1,
  structuredConfig,
  updatedAt: new Date(),
};

fixtures.draft = {
  blueprintPreview: null,
  blueprintPreviewGeneratedAt: null,
  blueprintPreviewHash: null,
  blueprintPreviewInputHash: null,
  createdAt: "2026-08-04T00:00:00.000Z",
  createdBy: "user-1",
  id: "upgrade-1",
  jobDescriptionId: record.id,
  organizationId: "org-1",
  prompt: "新版岗位 JD",
  structuredConfig,
  updatedAt: "2026-08-04T00:00:00.000Z",
  updatedBy: "user-1",
  version: 1,
};

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("JobDescriptionUpgradeDialog layout", () => {
  it("places scoring rules beside the new JD and keeps structured settings below", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <JobDescriptionUpgradeDialog
          onChanged={vi.fn()}
          onOpenChange={vi.fn()}
          open
          record={record}
        />,
      );
      await Promise.resolve();
    });

    const jdHeading = [...container.querySelectorAll("h2")].find(
      (heading) => heading.textContent === "新版岗位 JD",
    );
    const rulesHeading = [...container.querySelectorAll("h2")].find(
      (heading) => heading.textContent === "新版评分规则",
    );
    if (!(jdHeading && rulesHeading)) {
      throw new Error("expected both upgrade editor headings");
    }

    const jdSection = jdHeading.parentElement?.parentElement;
    const rulesSection = rulesHeading.parentElement?.parentElement?.parentElement;
    expect(jdSection?.parentElement).toBe(rulesSection?.parentElement);
    expect(jdSection?.parentElement?.className).toContain("xl:grid-cols-2");

    const generateButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("生成评分规则"),
    );
    expect(rulesSection?.contains(generateButton ?? null)).toBe(true);

    const structuredFields = container.querySelector('[data-testid="structured-fields"]');
    expect(jdSection?.parentElement?.contains(structuredFields)).toBe(false);
    expect(jdSection?.parentElement?.compareDocumentPosition(structuredFields as Node) ?? 0).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    act(() => root.unmount());
  });
});
