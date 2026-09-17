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

function renderPanel(count: number, canManage: boolean, contentType = "image/png") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(
    ["recruiting-materials", "acme", "candidate"],
    Array.from({ length: count }, (_, index) => ({
      contentType,
      createdAt: "2026-09-08T00:00:00.000Z",
      fileName: `流水-${index}.png`,
      id: `file-${index}`,
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
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("下载原图片");
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

it("keeps non-image attachments download-only", () => {
  const { host, cleanup } = renderPanel(1, true, "application/pdf");
  try {
    expect(host.querySelector('[aria-label^="预览 "]')).toBeNull();
    expect(host.querySelector("a[download]")).not.toBeNull();
  } finally {
    cleanup();
  }
});
