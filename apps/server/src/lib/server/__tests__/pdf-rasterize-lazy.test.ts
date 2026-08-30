import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PdfPageRenderer } from "../pdf-rasterize";
import { processPdfPagesWithMeta } from "../pdf-rasterize";

const rendererState = {
  documentDestroy: vi.fn(),
  failRenderAt: new Set<number>(),
  loadPage: vi.fn(),
};

const renderer: PdfPageRenderer = {
  openDocument: () =>
    Promise.resolve({
      destroy: rendererState.documentDestroy,
      pageCount: 6,
      renderPage: (index) => {
        rendererState.loadPage(index);
        if (rendererState.failRenderAt.has(index)) {
          throw new Error(`render failed at page ${index + 1}`);
        }
        return Buffer.from([index + 1]);
      },
    }),
};

describe("lazy PDF page rasterization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rendererState.failRenderAt.clear();
  });

  it("does not render pages beyond the active processing window", async () => {
    const { promise: pageGate, resolve: releasePages } = Promise.withResolvers<boolean>();
    const started: number[] = [];

    const processing = processPdfPagesWithMeta(
      new Uint8Array([1, 2, 3]),
      { concurrency: 4, maxPages: 6, scale: 2 },
      async (_png, index) => {
        started.push(index);
        await pageGate;
        return `page-${index + 1}`;
      },
      renderer,
    );

    await vi.waitFor(() => expect(started).toHaveLength(4));
    expect(rendererState.loadPage).toHaveBeenCalledTimes(4);

    releasePages(true);
    await expect(processing).resolves.toMatchObject({
      results: ["page-1", "page-2", "page-3", "page-4", "page-5", "page-6"],
    });
    expect(rendererState.loadPage).toHaveBeenCalledTimes(6);
  });

  it("stops assigning pages when rendering fails", async () => {
    rendererState.failRenderAt.add(0);

    await expect(
      processPdfPagesWithMeta(
        new Uint8Array([1, 2, 3]),
        { concurrency: 4, maxPages: 6, scale: 2 },
        () => Promise.resolve("unreachable"),
        renderer,
      ),
    ).rejects.toThrow("render failed at page 1");

    expect(rendererState.loadPage).toHaveBeenCalledTimes(1);
    expect(rendererState.documentDestroy).toHaveBeenCalledTimes(1);
  });
});
