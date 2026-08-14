/* oxlint-disable max-lines -- end-to-end job draft, preview, and publish states share one dialog harness. */
// @vitest-environment jsdom

import { act, useState } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultJobDescriptionStructuredConfig } from "@arc/db-schema/job-description-structured-config";
import { createDefaultResumeScreeningPolicy } from "@arc/shared/job-descriptions";
import type { JobDescriptionRecord } from "@arc/shared/job-descriptions";
import { JobDescriptionFormDialog } from "./job-description-form-dialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.hoisted(() => {
  const calls: string[] = [];
  const state = { savedRecord: null as Record<string, unknown> | null };
  const blueprint = {
    auxiliarySkills: [],
    compiler: {
      generatedAt: "2026-08-03T00:00:00.000Z",
      modelId: "test",
      promptVersion: "v1",
    },
    coreSkills: [],
    dimensionExpectations: {
      educationBackground: [],
      experienceRelevance: [],
      potential: [],
      projectMatch: [],
      skillMatch: [],
      stability: [],
    },
    educationExpectation: null,
    exclusionConditions: [],
    hardGateRequirements: [],
    priorityConditions: [],
    requiredRelevantExperience: null,
    schemaVersion: 1,
  };
  return {
    blueprint,
    calls,
    generateJobDescription: vi.fn(() =>
      Promise.resolve(
        Response.json({
          jobDescription:
            "岗位职责\n负责前端架构与团队管理。\n任职要求\n具备大型项目和团队管理经验。",
          suggestedName: "前端技术经理",
          supplementedItems: [
            {
              detail: "补充了团队规模和管理年限要求",
              section: "experience",
            },
          ],
        }),
      ),
    ),
    generatePreview: vi.fn(() => {
      calls.push("preview");
      return Promise.resolve(
        new Response(
          `event: job-evaluation-preview\ndata: ${JSON.stringify({
            blueprint,
            blueprintHash: "blueprint-hash",
            type: "preview.completed",
          })}\n\n`,
          { headers: { "Content-Type": "text/event-stream" } },
        ),
      );
    }),
    saveDraft: vi.fn(({ json }: { json: Record<string, unknown> }) => {
      calls.push("save");
      return Promise.resolve(Response.json({ ...state.savedRecord, ...json }));
    }),
    saveRuleDraft: vi.fn(() =>
      Promise.resolve(
        Response.json({
          blueprint,
          blueprintHash: "saved-blueprint-hash",
        }),
      ),
    ),
    state,
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
              $post: api.saveDraft,
              ":id": {
                $patch: api.saveDraft,
                "evaluation-blueprint-preview": {
                  $post: api.generatePreview,
                },
                "evaluation-blueprint-preview-stream": {
                  $post: api.generatePreview,
                },
                "evaluation-rule-draft": {
                  $put: api.saveRuleDraft,
                },
                operational: { $patch: vi.fn() },
                publish: { $post: vi.fn() },
              },
              "ai-generate": {
                $post: api.generateJobDescription,
              },
            },
          },
        },
      },
    },
  },
}));

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
      <h2>{title}</h2>
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
  JobDescriptionStructuredFields: () => <div>新版评分设置</div>,
}));

vi.mock("./job-description-screening-fields", () => ({
  ResumeScreeningPolicyFields: () => <div>旧版筛选规则</div>,
}));

vi.mock("./job-evaluation-blueprint-preview", () => ({
  JobEvaluationBlueprintPreview: ({ ruleDraft }: { ruleDraft: Record<string, unknown> }) => (
    <div>
      <span>评分规则预览</span>
      <span>{JSON.stringify(ruleDraft)}</span>
    </div>
  ),
}));

vi.mock("./job-description-linked-resources", () => ({
  LinkedFormsList: () => null,
  LinkedInterviewQuestionTemplatesList: () => null,
}));

vi.mock("@/components/features/markdown-editor", () => ({
  MarkdownEditor: ({
    disabled,
    onChange,
    showPreview,
    value,
  }: {
    disabled?: boolean;
    onChange: (value: string) => void;
    showPreview?: boolean;
    value: string;
  }) => (
    <textarea
      aria-label="MarkdownEditor"
      data-show-preview={String(showPreview)}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    />
  ),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const record: JobDescriptionRecord = {
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
  evaluationUpgradedAt: null,
  evaluationUpgradedBy: null,
  hasEvaluationUpgradeDraft: false,
  id: "job-1",
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
};

afterEach(() => {
  document.body.innerHTML = "";
  api.calls.length = 0;
  vi.clearAllMocks();
});

api.state.savedRecord = record as unknown as Record<string, unknown>;
describe("structured job description preview flow", () => {
  it("uses a single 岗位 JD field and a side-by-side scoring preview for structured jobs", async () => {
    const structuredContainer = document.createElement("div");
    document.body.append(structuredContainer);
    const structuredRoot = createRoot(structuredContainer);

    await act(async () => {
      structuredRoot.render(
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

    const structuredLabels = [...structuredContainer.querySelectorAll("label")].map((label) =>
      label.textContent?.trim(),
    );
    expect(structuredLabels).toContain("岗位 JD *");
    expect(structuredLabels).not.toContain("描述");
    expect(structuredLabels).not.toContain("岗位 Prompt *");
    expect(structuredContainer.textContent).toContain("新版评分设置");
    expect(structuredContainer.textContent).not.toContain("旧版筛选规则");
    const publishButton = [...structuredContainer.querySelectorAll("button")].find((item) =>
      item.textContent?.includes("生成评分规则并继续"),
    );
    expect(publishButton?.hasAttribute("disabled")).toBe(false);
    const structuredPrompt = structuredContainer.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="MarkdownEditor"]',
    );
    expect(structuredPrompt).not.toBeNull();
    expect(structuredPrompt?.dataset.showPreview).toBe("true");
    expect(structuredContainer.querySelector(".xl\\:grid-cols-2")).not.toBeNull();
    const settingsGroup = structuredContainer.querySelector(".divide-y");
    const settingsFields = settingsGroup?.querySelectorAll('[data-slot="field"]');
    expect(settingsFields).toHaveLength(5);
    expect(settingsGroup?.querySelector('[data-slot="card"]')).toBeNull();
    expect(settingsGroup?.querySelectorAll('[data-slot="field-description"]')).toHaveLength(5);
    expect(settingsGroup?.textContent).toContain("显示在岗位列表、候选人和面试记录中。");
    expect(settingsFields?.[3]?.className).toContain("@md/field-group:items-center!");
    expect(settingsFields?.[3]?.querySelector('[data-slot="switch"]')?.className).toContain("h-6!");
    act(() => structuredRoot.unmount());

    const legacyContainer = document.createElement("div");
    document.body.append(legacyContainer);
    const legacyRoot = createRoot(legacyContainer);

    await act(async () => {
      legacyRoot.render(
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
          record={{ ...record, evaluationMode: "legacy" } as never}
        />,
      );
      await Promise.resolve();
    });

    const legacyLabels = [...legacyContainer.querySelectorAll("label")].map((label) =>
      label.textContent?.trim(),
    );
    expect(legacyLabels).toContain("描述");
    expect(legacyLabels).toContain("岗位 Prompt *");
    expect(legacyContainer.textContent).not.toContain("旧版筛选规则");
    expect(legacyContainer.textContent).not.toContain("新版评分设置");
    expect(legacyContainer.querySelector('textarea[aria-label="MarkdownEditor"]')).toBeNull();
    expect(legacyContainer.querySelector(".typeset")?.textContent).toContain("岗位要求");
    act(() => legacyRoot.unmount());
  });

  it("reviews AI supplements before applying an optimized JD in the new-job form", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <JobDescriptionFormDialog
          departments={[{ id: "department-1", name: "研发部" } as never]}
          initialDraft={{
            ...record,
            code: "",
            description: "",
            prompt: "负责前端研发。",
          }}
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
          record={null}
        />,
      );
      await Promise.resolve();
    });

    const generateButton = [...container.querySelectorAll("button")].find((item) =>
      item.textContent?.includes("一键生成 JD"),
    );
    expect(generateButton).toBeDefined();

    await act(async () => {
      generateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await vi.waitFor(() => expect(api.generateJobDescription).toHaveBeenCalledTimes(1));
    });

    const editor = container.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="MarkdownEditor"]',
    );
    expect(editor?.value).toBe("负责前端研发。");
    expect(container.textContent).toContain("请核对 AI 补充内容");
    expect(container.textContent).toContain("补充了团队规模和管理年限要求");

    const applyButton = [...container.querySelectorAll("button")].find((item) =>
      item.textContent?.includes("确认并采用"),
    );
    await act(async () => {
      applyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(editor?.value).toBe(
      "岗位职责\n负责前端架构与团队管理。\n任职要求\n具备大型项目和团队管理经验。",
    );
    act(() => root.unmount());
  });

  it("creates a draft and renders scoring rules from the new-job form", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onSaved = vi.fn();

    await act(async () => {
      root.render(
        <JobDescriptionFormDialog
          departments={[{ id: "department-1", name: "研发部" } as never]}
          initialDraft={{
            allowCrossDepartmentInterviewers: false,
            code: "",
            departmentId: "department-1",
            description: "",
            interviewerIds: ["interviewer-1"],
            name: "前端技术经理",
            prompt: "岗位要求",
            resumeScreeningPolicy: createDefaultResumeScreeningPolicy(),
            structuredConfig: createDefaultJobDescriptionStructuredConfig(),
          }}
          interviewers={[
            {
              departmentId: "department-1",
              id: "interviewer-1",
              name: "面试官",
            } as never,
          ]}
          onOpenChange={vi.fn()}
          onSaved={onSaved}
          open
          record={null}
        />,
      );
      await Promise.resolve();
    });

    const generateButton = [...container.querySelectorAll("button")].find((item) =>
      item.textContent?.includes("生成评分规则"),
    );
    expect(generateButton).toBeDefined();

    await act(async () => {
      generateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await vi.waitFor(() => expect(api.generatePreview).toHaveBeenCalledTimes(1));
    });

    expect(api.calls).toEqual(["save", "preview"]);
    expect(container.textContent).toContain("评分规则预览");
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluationBlueprintPreviewHash: "blueprint-hash",
        id: "job-1",
      }),
    );

    act(() => root.unmount());
  });

  it("generates missing scoring rules from the publish action before confirmation", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const encoder = new TextEncoder();
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
    const partialEvent = `event: job-evaluation-preview\ndata: ${JSON.stringify({
      ruleDraft: {
        auxiliarySkills: [],
        coreSkills: ["React"],
        dimensionExpectations: {
          educationBackground: [],
          experienceRelevance: [],
          potential: [],
          projectMatch: [],
          skillMatch: [],
          stability: [],
        },
        educationExpectation: null,
        requiredRelevantExperience: null,
      },
      type: "preview.partial",
    })}\n\n`;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          streamController = controller;
          controller.enqueue(encoder.encode(partialEvent));
        },
      }),
      { headers: { "Content-Type": "text/event-stream" } },
    );
    api.generatePreview.mockResolvedValueOnce(response);

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

    const button = [...container.querySelectorAll("button")].find(
      (item) => item.textContent?.trim() === "生成评分规则并继续",
    );
    const cancelButton = [...container.querySelectorAll("button")].find(
      (item) => item.textContent?.trim() === "取消",
    );
    expect(button).toBeDefined();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await vi.waitFor(() => expect(api.generatePreview).toHaveBeenCalledTimes(1));
    });

    expect(button?.textContent).toContain("生成中");
    expect(button?.hasAttribute("disabled")).toBe(true);
    expect(cancelButton?.hasAttribute("disabled")).toBe(true);
    expect(api.calls).toEqual(["save"]);
    expect(api.saveDraft).toHaveBeenCalledTimes(1);
    expect(api.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        json: expect.objectContaining({
          description: "",
          prompt: "岗位要求",
        }),
      }),
    );

    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain("React"));
    });
    expect(button?.textContent).toContain("生成中");
    expect(button?.hasAttribute("disabled")).toBe(true);

    await act(async () => {
      streamController?.enqueue(
        encoder.encode(
          `event: job-evaluation-preview\ndata: ${JSON.stringify({
            blueprint: api.blueprint,
            blueprintHash: "blueprint-hash",
            type: "preview.completed",
          })}\n\n`,
        ),
      );
      streamController?.close();
      await Promise.resolve();
    });
    await vi.waitFor(() =>
      expect(
        [...container.querySelectorAll("button")].find((item) =>
          item.textContent?.includes("确认并发布"),
        ),
      ).toBeDefined(),
    );
    expect(container.textContent).toContain("评分规则预览");

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

  it("keeps the adopted JD visible while scoring rules are being generated", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const adoptedPrompt = "采用后的岗位职责\n采用后的任职要求";
    const adoptedRecord = { ...record, prompt: adoptedPrompt };
    const { promise: previewResponse, resolve: resolvePreview } = Promise.withResolvers<Response>();
    api.saveDraft.mockImplementationOnce(({ json }: { json: Record<string, unknown> }) =>
      Promise.resolve(Response.json({ ...record, ...json, prompt: "岗位要求" })),
    );
    api.generatePreview.mockImplementationOnce(() => previewResponse);

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
          record={adoptedRecord as never}
        />,
      );
      await Promise.resolve();
    });

    const editor = container.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="MarkdownEditor"]',
    );
    expect(editor).not.toBeNull();
    expect(editor?.value).toBe(adoptedPrompt);

    const generateButton = [...container.querySelectorAll("button")].find((item) =>
      item.textContent?.includes("生成评分规则"),
    );
    await act(async () => {
      generateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await vi.waitFor(() => expect(api.generatePreview).toHaveBeenCalledTimes(1));
    });

    expect(editor?.value).toBe(adoptedPrompt);

    await act(async () => {
      resolvePreview(Response.json({ blueprint: api.blueprint, blueprintHash: "hash" }));
      await previewResponse;
      await Promise.resolve();
    });
    act(() => root.unmount());
  });

  it("allows an unchanged saved preview to be published after reopening", async () => {
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
          record={
            {
              ...record,
              evaluationBlueprintPreview: api.blueprint,
              evaluationBlueprintPreviewHash: "blueprint-hash",
            } as never
          }
        />,
      );
      await Promise.resolve();
    });

    const publishButton = [...container.querySelectorAll("button")].find((item) =>
      item.textContent?.includes("确认并发布"),
    );
    expect(publishButton).toBeDefined();
    expect(publishButton?.hasAttribute("disabled")).toBe(false);

    const nameInput = container.querySelector<HTMLInputElement>("#name");
    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(nameInput, "尚未保存的新岗位名");
      nameInput?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(publishButton?.hasAttribute("disabled")).toBe(true);

    act(() => root.unmount());
  });

  it("saves unchanged job information and keeps the dialog open", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onOpenChange = vi.fn();
    const { promise, resolve } = Promise.withResolvers<Response>();
    api.saveDraft.mockReturnValueOnce(promise);

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
          onOpenChange={onOpenChange}
          onSaved={vi.fn()}
          open
          record={record as never}
        />,
      );
      await Promise.resolve();
    });

    const saveButton = [...container.querySelectorAll("button")].find(
      (item) => item.textContent?.trim() === "保存",
    );
    const cancelButton = [...container.querySelectorAll("button")].find(
      (item) => item.textContent?.trim() === "取消",
    );
    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await vi.waitFor(() => expect(api.saveDraft).toHaveBeenCalledTimes(1));
    });

    expect(saveButton?.textContent).toContain("保存中");
    expect(saveButton?.hasAttribute("disabled")).toBe(true);
    expect(cancelButton?.textContent).toContain("处理中");
    expect(cancelButton?.hasAttribute("disabled")).toBe(true);

    await act(async () => {
      resolve(Response.json(api.state.savedRecord));
      await promise;
    });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(container.textContent).toContain("编辑在招岗位");
    act(() => root.unmount());
  });

  it("keeps saved form values when preview generation fails and parent data refreshes", async () => {
    api.generatePreview.mockResolvedValueOnce(
      Response.json(
        {
          code: "JOB_BLUEPRINT_INVENTED_EXPECTATION",
          error: "蓝图内容没有岗位来源",
        },
        { status: 422 },
      ),
    );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    function Harness() {
      const [refreshVersion, setRefreshVersion] = useState(0);
      const [currentRecord, setCurrentRecord] = useState(record);
      return (
        <JobDescriptionFormDialog
          departments={[{ id: "department-1", name: "研发部" } as never]}
          interviewers={[
            {
              departmentId: "department-1",
              id: "interviewer-1",
              name: `面试官-${refreshVersion}`,
            } as never,
          ]}
          onOpenChange={vi.fn()}
          onSaved={(savedRecord) => {
            setCurrentRecord(savedRecord);
            setRefreshVersion((current) => current + 1);
          }}
          open
          record={currentRecord as never}
        />
      );
    }

    await act(async () => {
      root.render(<Harness />);
      await Promise.resolve();
    });

    const nameInput = container.querySelector<HTMLInputElement>("#name");
    expect(nameInput?.value).toBe("旧岗位名");
    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(nameInput, "已保存的新岗位名");
      nameInput?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const previewButton = [...container.querySelectorAll("button")].find((item) =>
      item.textContent?.includes("生成评分规则"),
    );
    await act(async () => {
      previewButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await vi.waitFor(() => {
        expect(api.generatePreview).toHaveBeenCalledTimes(1);
      });
    });

    expect(nameInput?.value).toBe("已保存的新岗位名");

    act(() => root.unmount());
  });

  it("renders published job JD as markdown instead of an editor", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const publishedPrompt = "负责前端架构。\n\n- 精通 React";

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
          record={
            {
              ...record,
              evaluationBlueprint: api.blueprint,
              evaluationBlueprintHash: "published-hash",
              lifecycleStatus: "published",
              prompt: publishedPrompt,
              publishedAt: new Date(),
            } as never
          }
        />,
      );
      await Promise.resolve();
    });

    expect(container.querySelector('textarea[aria-label="MarkdownEditor"]')).toBeNull();
    expect(container.querySelector(".typeset")?.textContent).toContain("负责前端架构");
    expect(container.textContent).not.toContain("一键生成 JD");
    expect(container.textContent).not.toContain("生成评分规则");

    act(() => root.unmount());
  });
});
