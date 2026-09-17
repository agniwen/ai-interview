// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { RecruitingMaterialPreview } from "./recruiting-material-preview";

// SAFETY: React's documented test environment flag.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

window.matchMedia = vi.fn().mockReturnValue({
  addEventListener: vi.fn(),
  matches: false,
  removeEventListener: vi.fn(),
});

afterEach(() => vi.restoreAllMocks());

async function renderPreview(contentType = "image/png") {
  const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
  const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(new Blob(["media"], { type: "application/octet-stream" })));
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onClose = vi.fn();
  await act(() => {
    root.render(
      <RecruitingMaterialPreview
        file={{ contentType, fileName: "attachment", sizeBytes: 20 }}
        url="/private/file"
        onClose={onClose}
      />,
    );
  });
  return {
    cleanup: () => {
      act(() => root.unmount());
      host.remove();
    },
    createUrl,
    fetchMock,
    onClose,
    revokeUrl,
  };
}

it("switches image sizing without refetching and releases the authenticated blob on close", async () => {
  const context = await renderPreview();
  try {
    expect(context.fetchMock).toHaveBeenCalledWith(
      "/private/file",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(context.createUrl.mock.calls[0]?.[0]).toMatchObject({ type: "image/png" });
    const viewport = document.querySelector<HTMLElement>('[aria-label="附件预览画布"]');
    if (viewport) {
      viewport.scrollTo = vi.fn();
    }
    const image = document.querySelector("img");
    expect(image?.className).toContain("object-contain");
    await act(() => {
      image?.dispatchEvent(new Event("load"));
      [...document.querySelectorAll("button")]
        .find((button) => button.textContent === "原始大小")
        ?.click();
    });
    expect(image?.className).toContain("max-w-none");
    expect(image?.className).not.toContain("object-contain");
    await act(() => {
      [...document.querySelectorAll("button")]
        .find((button) => button.textContent === "适配大小")
        ?.click();
    });
    expect(image?.className).toContain("object-contain");
    expect(context.fetchMock).toHaveBeenCalledTimes(1);
    act(() => document.querySelector<HTMLButtonElement>('[data-slot="modal-close"]')?.click());
    expect(context.onClose).toHaveBeenCalledOnce();
  } finally {
    context.cleanup();
  }
  expect(context.revokeUrl).toHaveBeenCalledWith("blob:preview");
  expect(context.fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
});

it("loads video with its MIME type and keeps download available when decoding fails", async () => {
  const context = await renderPreview("video/mp4");
  try {
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(context.createUrl.mock.calls[0]?.[0]).toMatchObject({ type: "video/mp4" });
    expect(document.querySelector('[aria-label="图片显示大小"]')).toBeNull();
    expect(document.querySelector("video")?.getAttribute("src")).toBe("blob:preview");
    act(() => document.querySelector("video")?.dispatchEvent(new Event("error")));
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("视频无法预览");
    expect(document.querySelector('[aria-label="下载原视频"]')?.getAttribute("href")).toBe(
      "/private/file",
    );
  } finally {
    context.cleanup();
  }
});

it("does not create a blob after closing a pending preview", async () => {
  const { promise: pending, resolve: finish } = Promise.withResolvers<Response>();
  const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(pending);
  const createUrl = vi.spyOn(URL, "createObjectURL");
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(() => {
    root.render(
      <RecruitingMaterialPreview
        file={{ contentType: "video/mp4", fileName: "video", sizeBytes: 10 }}
        url="/pending"
        onClose={() => {}}
      />,
    );
  });
  act(() => root.unmount());
  await act(() => {
    finish(new Response("late media"));
  });
  expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  expect(createUrl).not.toHaveBeenCalled();
});

it("shows placeholders for attachments without optional metadata", async () => {
  const context = await renderPreview("application/pdf");
  try {
    const metadata = document.querySelector('[aria-label="附件信息"]');
    expect(metadata?.textContent).toContain("未标记");
    expect(metadata?.textContent).toContain("暂无备注");
  } finally {
    context.cleanup();
  }
});
