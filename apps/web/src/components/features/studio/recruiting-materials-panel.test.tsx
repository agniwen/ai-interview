// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceSlugProvider } from "@/lib/client/workspace-context";
import { RecruitingMaterialsPanel } from "./recruiting-materials-panel";

// SAFETY: React's test-only act environment flag.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

window.matchMedia = vi.fn().mockReturnValue({
  addEventListener: vi.fn(),
  matches: false,
  removeEventListener: vi.fn(),
});

function renderPanel(
  count: number,
  canManage: boolean,
  contentType: string | string[] = "image/png",
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(
    ["recruiting-materials", "acme", "candidate"],
    Array.from({ length: count }, (_, index) => ({
      contentType: Array.isArray(contentType) ? contentType[index] : contentType,
      createdAt: "2026-09-08T00:00:00.000Z",
      fileName: `流水-${index}.png`,
      id: `file-${index}`,
      incomeType: index === 1 ? "stock" : "monthly_salary",
      notes: index === 1 ? "股票归属说明\n第二行" : "每月固定工资",
      sizeBytes: 1024,
    })),
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceSlugProvider id="org" slug="acme" memberRole="hr" permissions={{}}>
          <RecruitingMaterialsPanel
            candidateId="candidate"
            canCreate={canManage}
            canDelete={canManage}
            canUpdate={canManage}
          />
        </WorkspaceSlugProvider>
      </QueryClientProvider>,
    ),
  );
  return {
    cleanup: () => {
      act(() => root.unmount());
      queryClient.clear();
      host.remove();
    },
    host,
  };
}

describe("recruiting materials panel", () => {
  it("disables upload at ten files and keeps downloads accessible", () => {
    const { host, cleanup } = renderPanel(10, true);
    try {
      expect(host.textContent).toContain("流水文件（10/10）");
      expect(host.querySelector<HTMLButtonElement>('[aria-label="上传附件"]')?.disabled).toBe(true);
      expect(host.querySelectorAll("a[download]")).toHaveLength(10);
      expect(host.querySelector("a")?.getAttribute("href")).toBe(
        "/api/w/acme/studio/interviews/candidate/materials/file-0/file",
      );
    } finally {
      cleanup();
    }
  });

  it("allows upload below the limit", () => {
    const { host, cleanup } = renderPanel(9, true);
    try {
      expect(host.querySelector<HTMLButtonElement>('[aria-label="上传附件"]')?.disabled).toBe(
        false,
      );
      expect(host.querySelector<HTMLInputElement>('input[type="file"]')?.multiple).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("hides mutation actions from read-only HR accounts", () => {
    const { host, cleanup } = renderPanel(1, false);
    try {
      expect(host.textContent).not.toContain("上传附件");
      expect(host.querySelector('[aria-label="删除 流水-0.png"]')).toBeNull();
      expect(host.querySelector('[aria-label^="编辑 "]')).toBeNull();
      expect(host.querySelector("a[download]")).not.toBeNull();
    } finally {
      cleanup();
    }
  });
});

it("opens image attachments using the authenticated download endpoint", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
  vi.stubGlobal("fetch", fetchMock);
  const { host, cleanup } = renderPanel(1, false);
  try {
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[aria-label="预览 流水-0.png"]')?.click();
      await Promise.resolve();
    });
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("图片预览");
    expect(document.querySelector('[aria-label="下载原图片"]')).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/w/acme/studio/interviews/candidate/materials/file-0/file",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("图片加载失败");
  } finally {
    cleanup();
    vi.unstubAllGlobals();
  }
});

it("keeps document attachments download-only", () => {
  const { host, cleanup } = renderPanel(1, true, "application/pdf");
  try {
    expect(host.querySelector('[aria-label^="预览 "]')).toBeNull();
    expect(host.querySelector("a[download]")).not.toBeNull();
  } finally {
    cleanup();
  }
});

it("opens video attachments in the preview while preserving downloads", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
  const { host, cleanup } = renderPanel(1, false, "video/mp4");
  try {
    expect(host.querySelector('[aria-label="播放视频 流水-0.png"]')).not.toBeNull();
    await act(() =>
      host.querySelector<HTMLButtonElement>('[aria-label="预览 流水-0.png"]')?.click(),
    );
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("视频预览");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("视频无法预览");
    expect(document.querySelector('[aria-label="下载原视频"]')?.getAttribute("href")).toBe(
      "/api/w/acme/studio/interviews/candidate/materials/file-0/file",
    );
    expect(document.querySelector('[aria-label="图片显示大小"]')).toBeNull();
  } finally {
    cleanup();
    vi.unstubAllGlobals();
  }
});

function expectPreviewMetadata(type: string, notes: string) {
  const metadata = document.querySelector('[role="dialog"] [aria-label="附件信息"]');
  expect(metadata?.textContent).toContain(type);
  expect(metadata?.textContent).toContain(notes);
}

it("navigates mixed attachments in order without remounting the dialog", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
  vi.stubGlobal("fetch", fetchMock);
  const { host, cleanup } = renderPanel(3, false, ["image/png", "application/pdf", "video/mp4"]);
  try {
    await act(() =>
      host.querySelector<HTMLButtonElement>('[aria-label="预览 流水-0.png"]')?.click(),
    );
    const dialog = document.querySelector('[role="dialog"]');
    const previous = document.querySelector<HTMLButtonElement>('[aria-label="上一个附件"]');
    const next = document.querySelector<HTMLButtonElement>('[aria-label="下一个附件"]');
    expect(previous?.disabled).toBe(true);
    expect(next?.disabled).toBe(false);
    expect(dialog?.textContent).toContain("1 / 3");
    expectPreviewMetadata("月薪", "每月固定工资");
    const requestsBeforeDocument = fetchMock.mock.calls.length;
    await act(() => next?.click());
    expect(document.querySelector('[role="dialog"]')).toBe(dialog);
    expect(dialog?.textContent).toContain("2 / 3");
    expectPreviewMetadata("股票", "股票归属说明\n第二行");
    expect(dialog?.textContent).toContain("此附件暂不支持在线预览");
    expect(fetchMock.mock.calls).toHaveLength(requestsBeforeDocument);
    expect(document.querySelector('[aria-label="下载原文件"]')?.getAttribute("href")).toContain(
      "file-1/file",
    );
    await act(() => next?.click());
    expect(dialog?.textContent).toContain("视频预览");
    expect(dialog?.textContent).toContain("3 / 3");
    expect(next?.disabled).toBe(true);
    expect(previous?.disabled).toBe(false);
    expect(document.querySelector('[aria-label="下载原视频"]')?.getAttribute("href")).toContain(
      "file-2/file",
    );
    await act(() => previous?.click());
    await act(() => previous?.click());
    expect(dialog?.textContent).toContain("1 / 3");
    expectPreviewMetadata("月薪", "每月固定工资");
    expect(dialog?.textContent).toContain("图片预览");
    expect(previous?.disabled).toBe(true);
  } finally {
    cleanup();
    vi.unstubAllGlobals();
  }
});

it("opens saved per-file metadata with a three-row notes field and all seven types", async () => {
  const { host, cleanup } = renderPanel(1, true, "application/pdf");
  try {
    expect(host.textContent).toContain("月薪");
    expect(host.textContent).toContain("每月固定工资");
    await act(() => host.querySelector<HTMLButtonElement>('[aria-label^="编辑 "]')?.click());
    const textarea = document.querySelector<HTMLTextAreaElement>("textarea");
    expect(textarea?.rows).toBe(3);
    expect(textarea?.value).toBe("每月固定工资");
    await act(() => document.querySelector<HTMLButtonElement>('[role="combobox"]')?.click());
    const labels = [...document.querySelectorAll('[role="option"]')].map(
      (option) => option.textContent,
    );
    expect(labels).toEqual(["月薪", "年终", "奖金", "股票", "分红", "五险一金", "其他"]);
  } finally {
    cleanup();
  }
});

it("allows uploading selected files without type or notes", async () => {
  const { host, cleanup } = renderPanel(0, true);
  try {
    const input = host.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) {
      throw new Error("missing file input");
    }
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["a"], "月薪.pdf"), new File(["b"], "股票.pdf")],
    });
    await act(() => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("月薪.pdf");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("股票.pdf");
    expect(document.querySelectorAll('textarea[rows="3"]')).toHaveLength(2);
    const upload = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "确认上传",
    );
    expect(upload?.disabled).toBe(false);
  } finally {
    cleanup();
  }
});
