// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ResumePoolListRecord } from "@app/shared/resume-pool";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiError } from "@/lib/client/api";

import { ImportResumePoolDialog } from "../resume-pool-dialogs";
import type { ImportResumePoolDialogDependencies } from "../resume-pool-dialogs";

// SAFETY: This test constructs the value with the asserted contract before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

const importResumePoolItemMock = vi.fn();

const dependencies: ImportResumePoolDialogDependencies = {
  importResumePoolItem: importResumePoolItemMock,
  isApiError: (_error): _error is ApiError => false,
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  renderStudioPersonDetail: ({ recordId }) => <div>招聘台详情 {recordId}</div>,
  useJobDescriptionOptions: () => ({
    data: [{ description: "研发部", label: "研发部 / 前端工程师", value: "jd-1" }],
  }),
  useWorkspaceSlug: () => "test-workspace",
};

// SAFETY: This test constructs the value with the asserted contract before this boundary.
const importedItem = {
  candidateName: "测试候选人",
  id: "pool-item-1",
  importedRecords: [
    {
      creatorImage: "https://example.com/creator-2.png",
      creatorName: "招聘管理员",
      importedAt: "2026-07-31T03:00:00.000Z",
      resumeRecordId: "resume-record-2",
    },
    {
      creatorImage: null,
      creatorName: "人事专员",
      importedAt: "2026-07-30T03:00:00.000Z",
      resumeRecordId: "resume-record-1",
    },
  ],
  importedResumeRecordId: "resume-record-2",
  jobDescriptionId: "jd-1",
  scope: "public",
} as ResumePoolListRecord;

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("ImportResumePoolDialog", () => {
  it("uses the standard modal body and footer for duplicate confirmation", async () => {
    importResumePoolItemMock.mockResolvedValue({
      matches: [
        {
          candidateEmail: "duplicate@example.com",
          candidateName: "疑似候选人",
          candidatePhone: "13800138000",
          createdAt: "2026-08-11T03:15:00.000Z",
          id: "duplicate-resume-1",
          jobDescriptionName: "内容运营经理",
          status: "active",
          targetRole: "内容运营经理",
        },
      ],
      status: "duplicate_found",
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ImportResumePoolDialog
            dependencies={dependencies}
            item={{ ...importedItem, importedRecords: [], importedResumeRecordId: null }}
            onImported={vi.fn()}
            onOpenChange={vi.fn()}
          />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    const confirmButton = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("确认创建"),
    );
    await act(async () => {
      confirmButton?.click();
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("招聘台中可能已有相同候选人");
    });
    expect(document.querySelector('[data-slot="alert-dialog-content"]')).toBeNull();
    const modalBodies = document.querySelectorAll<HTMLElement>('[data-slot="modal-body"]');
    const duplicateModalBody = modalBodies.item(modalBodies.length - 1);
    const forceImportButton = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("仍然入库"),
    );
    expect(duplicateModalBody.textContent).toContain("疑似候选人");
    expect(duplicateModalBody.contains(forceImportButton ?? null)).toBe(false);

    act(() => root.unmount());
    queryClient.clear();
    container.remove();
  });

  it("preserves user choices when the source job option arrives later", async () => {
    importResumePoolItemMock.mockResolvedValue({
      resumeRecordId: "resume-record-new",
      status: "imported",
    });
    let jobDescriptionOptions = [
      { description: "产品部", label: "产品部 / 产品经理", value: "jd-2" },
    ];
    const delayedOptionsDependencies: ImportResumePoolDialogDependencies = {
      ...dependencies,
      useJobDescriptionOptions: () => ({ data: jobDescriptionOptions }),
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });

    const renderDialog = () => (
      <QueryClientProvider client={queryClient}>
        <ImportResumePoolDialog
          dependencies={delayedOptionsDependencies}
          item={{ ...importedItem, importedRecords: [], importedResumeRecordId: null }}
          onImported={vi.fn()}
          onOpenChange={vi.fn()}
        />
      </QueryClientProvider>
    );

    await act(async () => {
      root.render(renderDialog());
      await Promise.resolve();
    });

    const jobInput = document.querySelector<HTMLInputElement>("#resume-pool-import-jd");
    await act(async () => {
      jobInput?.focus();
      jobInput?.click();
      jobInput?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }));
      await Promise.resolve();
    });
    const productJobOption = [
      ...document.querySelectorAll<HTMLElement>('[data-slot="combobox-item"]'),
    ].find((option) => option.textContent?.includes("产品部 / 产品经理"));
    await act(async () => {
      productJobOption?.click();
      await Promise.resolve();
    });
    expect(jobInput?.value).toBe("产品部 / 产品经理");

    const aiStage = [...document.querySelectorAll("label")]
      .find((label) => label.textContent?.includes("AI 面试"))
      ?.querySelector<HTMLElement>('[data-slot="radio-group-item"]');
    await act(async () => {
      aiStage?.click();
      await Promise.resolve();
    });
    const noJobMode = [...document.querySelectorAll("label")]
      .find((label) => label.textContent?.includes("不绑定岗位"))
      ?.querySelector<HTMLElement>('[data-slot="radio-group-item"]');
    await act(async () => {
      noJobMode?.click();
      await Promise.resolve();
    });

    jobDescriptionOptions = [
      { description: "研发部", label: "研发部 / 前端工程师", value: "jd-1" },
      ...jobDescriptionOptions,
    ];
    await act(async () => {
      root.render(renderDialog());
      await Promise.resolve();
    });

    expect(noJobMode?.getAttribute("aria-checked")).toBe("true");
    const bindMode = [...document.querySelectorAll("label")]
      .find((label) => label.textContent?.includes("绑定岗位"))
      ?.querySelector<HTMLElement>('[data-slot="radio-group-item"]');
    await act(async () => {
      bindMode?.click();
      await Promise.resolve();
    });
    expect(document.querySelector<HTMLInputElement>("#resume-pool-import-jd")?.value).toBe(
      "产品部 / 产品经理",
    );
    expect(aiStage?.getAttribute("aria-checked")).toBe("true");

    const confirmButton = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("确认创建"),
    );
    await act(async () => {
      confirmButton?.click();
      await Promise.resolve();
    });
    expect(importResumePoolItemMock).toHaveBeenCalledWith("test-workspace", "pool-item-1", {
      dedupPolicy: "check",
      initialRecruitmentStage: "ai_interview",
      jobDescriptionId: "jd-2",
      jobDescriptionMode: "bind",
      reimport: false,
    });

    act(() => root.unmount());
    queryClient.clear();
    container.remove();
  });

  it("resets draft and nested detail when switching items", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    const renderDialog = (item: ResumePoolListRecord) => (
      <QueryClientProvider client={queryClient}>
        <ImportResumePoolDialog
          dependencies={dependencies}
          item={item}
          onImported={vi.fn()}
          onOpenChange={vi.fn()}
        />
      </QueryClientProvider>
    );

    await act(async () => {
      root.render(renderDialog(importedItem));
      await Promise.resolve();
    });
    const importedRecordButton = document.querySelector<HTMLButtonElement>(
      '[aria-label="查看已创建的招聘记录 resume-record-2"]',
    );
    await act(async () => {
      importedRecordButton?.click();
      await Promise.resolve();
    });
    expect(document.body.textContent).toContain("招聘台详情 resume-record-2");

    await act(async () => {
      root.render(
        renderDialog({
          ...importedItem,
          id: "pool-item-2",
          importedRecords: [],
          importedResumeRecordId: null,
          jobDescriptionId: null,
        }),
      );
      await Promise.resolve();
    });

    expect(document.body.textContent).not.toContain("招聘台详情 resume-record-2");
    const bindMode = [...document.querySelectorAll("label")]
      .find((label) => label.textContent?.includes("绑定岗位"))
      ?.querySelector<HTMLElement>('[data-slot="radio-group-item"]');
    const screeningStage = [...document.querySelectorAll("label")]
      .find((label) => label.textContent?.includes("简历筛选"))
      ?.querySelector<HTMLElement>('[data-slot="radio-group-item"]');
    expect(bindMode?.getAttribute("aria-checked")).toBe("true");
    expect(screeningStage?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector<HTMLInputElement>("#resume-pool-import-jd")?.value).toBe("");

    act(() => root.unmount());
    queryClient.clear();
    container.remove();
  });

  it("keeps the selected job after rerender and submits its id", async () => {
    importResumePoolItemMock.mockResolvedValue({
      resumeRecordId: "resume-record-new",
      status: "imported",
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    const item: ResumePoolListRecord = {
      ...importedItem,
      id: "pool-item-new",
      importedRecords: [],
      importedResumeRecordId: null,
      jobDescriptionId: null,
    };

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ImportResumePoolDialog
            dependencies={dependencies}
            item={item}
            onImported={vi.fn()}
            onOpenChange={vi.fn()}
          />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    const jobInput = document.querySelector<HTMLInputElement>("#resume-pool-import-jd");
    expect(jobInput).not.toBeNull();
    await act(async () => {
      jobInput?.focus();
      jobInput?.click();
      jobInput?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }));
      await Promise.resolve();
    });

    const jobOption = document.querySelector<HTMLElement>('[data-slot="combobox-item"]');
    expect(jobOption?.textContent).toContain("研发部 / 前端工程师");
    await act(async () => {
      jobOption?.click();
      await Promise.resolve();
    });

    expect(jobInput?.value).toBe("研发部 / 前端工程师");
    const confirmButton = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("确认创建"),
    );
    expect(confirmButton?.disabled).toBe(false);

    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(importResumePoolItemMock).toHaveBeenCalledWith("test-workspace", "pool-item-new", {
      dedupPolicy: "check",
      initialRecruitmentStage: "screening",
      jobDescriptionId: "jd-1",
      jobDescriptionMode: "bind",
      reimport: false,
    });

    act(() => root.unmount());
    queryClient.clear();
    container.remove();
  });

  it("confirms and requests a new import for an imported resume", async () => {
    importResumePoolItemMock.mockResolvedValue({
      resumeRecordId: "resume-record-2",
      status: "imported",
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ImportResumePoolDialog
            dependencies={dependencies}
            item={importedItem}
            onImported={vi.fn()}
            onOpenChange={vi.fn()}
          />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("已存在招聘记录，是否再次创建。");
    const radioGroupText = document.querySelector('[data-slot="radio-group"]')?.textContent ?? "";
    expect(radioGroupText.indexOf("绑定岗位")).toBeLessThan(radioGroupText.indexOf("不绑定岗位"));
    expect(document.body.textContent).toContain("已创建的招聘记录");
    const importedRecordButton = document.querySelector<HTMLButtonElement>(
      '[aria-label="查看已创建的招聘记录 resume-record-2"]',
    );
    expect(importedRecordButton).toBeTruthy();
    const creatorAvatar = importedRecordButton?.querySelector<HTMLElement>('[data-slot="avatar"]');
    expect(
      document.querySelector('[aria-label="查看已创建的招聘记录 resume-record-1"]'),
    ).toBeTruthy();
    expect(document.body.textContent).toContain("创建人 招聘管理员");
    expect(document.body.textContent).toContain("创建人 人事专员");
    expect(creatorAvatar?.dataset.size).toBe("sm");
    await act(async () => {
      importedRecordButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("招聘台详情 resume-record-2");
    });

    const confirmButton = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("确认再次创建"),
    );
    expect(confirmButton).toBeTruthy();

    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(importResumePoolItemMock).toHaveBeenCalledWith("test-workspace", "pool-item-1", {
      dedupPolicy: "force",
      initialRecruitmentStage: "screening",
      jobDescriptionId: "jd-1",
      jobDescriptionMode: "bind",
      reimport: true,
    });

    act(() => {
      root.unmount();
    });
  });

  it("imports directly into the selected AI interview stage", async () => {
    importResumePoolItemMock.mockResolvedValue({
      resumeRecordId: "resume-record-ai",
      status: "imported",
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ImportResumePoolDialog
            dependencies={dependencies}
            item={{ ...importedItem, importedRecords: [], importedResumeRecordId: null }}
            onImported={vi.fn()}
            onOpenChange={vi.fn()}
          />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("进入招聘流程");
    const aiStageLabel = [...document.querySelectorAll("label")].find((label) =>
      label.textContent?.includes("AI 面试"),
    );
    const aiStage = aiStageLabel?.querySelector<HTMLElement>('[data-slot="radio-group-item"]');
    expect(aiStage).toBeTruthy();
    await act(async () => {
      aiStage?.click();
      await Promise.resolve();
    });

    const confirmButton = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("确认创建"),
    );
    await act(async () => {
      confirmButton?.click();
      await Promise.resolve();
    });

    expect(importResumePoolItemMock).toHaveBeenCalledWith("test-workspace", "pool-item-1", {
      dedupPolicy: "check",
      initialRecruitmentStage: "ai_interview",
      jobDescriptionId: "jd-1",
      jobDescriptionMode: "bind",
      reimport: false,
    });

    act(() => root.unmount());
    queryClient.clear();
    container.remove();
  });
});
