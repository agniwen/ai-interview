// @vitest-environment jsdom

import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultJobDescriptionStructuredConfig } from "@arc/db-schema/job-description-structured-config";
import { createDefaultResumeScreeningPolicy } from "@arc/shared/job-descriptions";
import { JobDescriptionFormDialog } from "./job-description-form-dialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.hoisted(() => {
  const calls: string[] = [];
  return {
    calls,
    generatePreview: vi.fn(() => {
      calls.push("preview");
      return Promise.resolve(
        Response.json({
          blueprint: {},
          blueprintHash: "blueprint-hash",
        }),
      );
    }),
    saveDraft: vi.fn(() => {
      calls.push("save");
      return Promise.resolve(Response.json({ id: "job-1" }));
    }),
  };
});

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/lib/client/workspace-context", () => ({
  useWorkspaceSlug: () => "workspace",
}));

vi.mock("@/lib/client/rpc", () => ({
  rpc: {
    api: {
      w: {
        ":slug": {
          studio: {
            "job-descriptions": {
              ":id": {
                $patch: api.saveDraft,
                "evaluation-blueprint-preview": {
                  $post: api.generatePreview,
                },
                operational: { $patch: vi.fn() },
                publish: { $post: vi.fn() },
              },
            },
          },
        },
      },
    },
  },
}));

vi.mock("@/components/ui/modal", () => ({
  Modal: ({ children, footer }: { children: ReactNode; footer: ReactNode }) => (
    <div>
      {children}
      {footer}
    </div>
  ),
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/features/motion/animated-height", () => ({
  AnimatedHeight: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("./job-description-structured-fields", () => ({
  JobDescriptionStructuredFields: () => null,
}));

vi.mock("./job-evaluation-blueprint-preview", () => ({
  JobEvaluationBlueprintPreview: () => null,
}));

vi.mock("./job-description-linked-resources", () => ({
  LinkedFormsList: () => null,
  LinkedInterviewQuestionTemplatesList: () => null,
}));

vi.mock("@/components/features/markdown-editor", () => ({
  MarkdownEditor: () => null,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const record = {
  allowCrossDepartmentInterviewers: false,
  code: "JOB0001",
  createdAt: new Date(),
  createdBy: "user-1",
  deductionRuleSetVersion: null,
  departmentId: "department-1",
  description: "旧描述",
  evaluationBlueprint: null,
  evaluationBlueprintHash: null,
  evaluationBlueprintPreview: null,
  evaluationBlueprintPreviewGeneratedAt: null,
  evaluationBlueprintPreviewHash: null,
  evaluationBlueprintPreviewInputHash: null,
  evaluationBlueprintSchemaVersion: null,
  evaluationMode: "structured",
  interviewerIds: ["interviewer-1"],
  lifecycleStatus: "draft",
  name: "旧岗位名",
  presetQuestions: [],
  prompt: "岗位要求",
  publishedAt: null,
  resumeScreeningPolicy: createDefaultResumeScreeningPolicy(),
  resumeScreeningPolicyHash: null,
  resumeScreeningPolicyVersion: 1,
  structuredConfig: createDefaultJobDescriptionStructuredConfig(),
  updatedAt: new Date(),
} as const;

afterEach(() => {
  document.body.innerHTML = "";
  api.calls.length = 0;
  vi.clearAllMocks();
});

describe("structured job description preview flow", () => {
  it("validates and saves the current draft before generating its preview", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <JobDescriptionFormDialog
          departments={[{ id: "department-1", name: "研发部" } as never]}
          interviewers={[
            {
              departmentId: "department-1",
              id: "interviewer-1",
              name: "面试官",
            } as never,
          ]}
          onOpenChange={vi.fn()}
          onSaved={vi.fn()}
          open
          record={record as never}
        />,
      );
      await Promise.resolve();
    });

    const button = [...container.querySelectorAll("button")].find((item) =>
      item.textContent?.includes("生成配置预览"),
    );
    expect(button).toBeDefined();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(api.calls).toEqual(["save", "preview"]);
    expect(api.saveDraft).toHaveBeenCalledTimes(1);

    const publishButton = [...container.querySelectorAll("button")].find((item) =>
      item.textContent?.includes("确认并发布"),
    );
    expect(publishButton).toBeDefined();
    expect(publishButton?.hasAttribute("disabled")).toBe(false);

    const nameInput = container.querySelector<HTMLInputElement>("#name");
    expect(nameInput).toBeDefined();
    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(nameInput, "新岗位名");
      nameInput?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(publishButton?.hasAttribute("disabled")).toBe(true);

    act(() => root.unmount());
  });
});
