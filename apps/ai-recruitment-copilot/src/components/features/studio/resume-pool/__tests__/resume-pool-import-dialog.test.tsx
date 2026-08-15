// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ResumePoolListRecord } from "@arc/shared/resume-pool";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ImportResumePoolDialog } from "../resume-pool-dialogs";
import type * as ResumePoolPageModel from "../resume-pool-page-model";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const importResumePoolItemMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@/lib/client/workspace-context", () => ({
  useWorkspaceSlug: () => "test-workspace",
}));

vi.mock("@/lib/client/api", () => ({
  importResumePoolItem: importResumePoolItemMock,
  isApiError: () => false,
}));

vi.mock("@/components/features/studio/studio-person-detail-dialog", () => ({
  StudioPersonDetailDialog: ({ open, recordId }: { open: boolean; recordId: string | null }) =>
    open ? <div>招聘台详情 {recordId}</div> : null,
}));

vi.mock("../resume-pool-page-model", async (importOriginal) => ({
  ...(await importOriginal<typeof ResumePoolPageModel>()),
  useJobDescriptions: () => ({
    data: [{ departmentName: "研发部", id: "jd-1", name: "前端工程师" }],
  }),
}));

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
          <ImportResumePoolDialog item={importedItem} onImported={vi.fn()} onOpenChange={vi.fn()} />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("已存在招聘记录，是否再次新建。");
    const radioGroupText = document.querySelector('[data-slot="radio-group"]')?.textContent ?? "";
    expect(radioGroupText.indexOf("绑定岗位")).toBeLessThan(radioGroupText.indexOf("不绑定岗位"));
    expect(document.body.textContent).toContain("已新建的招聘记录");
    const importedRecordButton = document.querySelector<HTMLButtonElement>(
      '[aria-label="查看已新建的招聘记录 resume-record-2"]',
    );
    expect(importedRecordButton).toBeTruthy();
    const creatorAvatar = importedRecordButton?.querySelector<HTMLElement>('[data-slot="avatar"]');
    expect(
      document.querySelector('[aria-label="查看已新建的招聘记录 resume-record-1"]'),
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
      button.textContent?.includes("确认再次新建"),
    );
    expect(confirmButton).toBeTruthy();

    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(importResumePoolItemMock).toHaveBeenCalledWith("test-workspace", "pool-item-1", {
      dedupPolicy: "force",
      jobDescriptionId: "jd-1",
      jobDescriptionMode: "bind",
      reimport: true,
    });

    act(() => {
      root.unmount();
    });
  });
});
