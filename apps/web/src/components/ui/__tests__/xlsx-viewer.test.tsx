// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { XlsxViewerPreview } from "../xlsx-viewer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const xlsxViewerMock = vi.hoisted(() => ({
  setZoomScale: vi.fn(),
}));

vi.mock("@extend-ai/react-xlsx", () => ({
  useXlsxViewer: () => ({
    activeSheetIndex: 0,
    error: null,
    setActiveSheetIndex: vi.fn(),
    sheets: [{ name: "Sheet1", workbookSheetIndex: 0 }],
  }),
  useXlsxViewerController: (controller: unknown) => controller,
  useXlsxViewerThumbnails: () => ({ thumbnails: [] }),
  useXlsxViewerZoom: () => ({
    canZoomIn: true,
    canZoomOut: true,
    setZoomScale: xlsxViewerMock.setZoomScale,
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    zoomScale: 100,
  }),
  XlsxViewer: () => <div data-testid="xlsx-viewer" />,
  XlsxViewerProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="xlsx-viewer-provider">{children}</div>
  ),
}));

function stubWorkbookFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      arrayBuffer: async () => new ArrayBuffer(8),
      ok: true,
    })),
  );
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("XlsxViewerPreview", () => {
  it("keeps the workbook actions menu above preview modals", async () => {
    stubWorkbookFetch();

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <XlsxViewerPreview
          isDark={false}
          onIsDarkChange={vi.fn()}
          showDownload={false}
          showUpload={false}
          src="/resume.xlsx"
        />,
      );
    });
    await flushAsyncWork();

    const trigger = document.querySelector<HTMLButtonElement>(
      'button[aria-label="打开表格操作菜单"]',
    );
    expect(trigger).toBeTruthy();

    act(() => {
      trigger?.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          button: 0,
          ctrlKey: false,
        }),
      );
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();

    const content = document.querySelector<HTMLElement>('[data-slot="dropdown-menu-content"]');
    expect(content?.textContent).toContain("深色模式");
    expect(content?.className).toContain("z-[60]");

    act(() => {
      root.unmount();
    });
  });
});
