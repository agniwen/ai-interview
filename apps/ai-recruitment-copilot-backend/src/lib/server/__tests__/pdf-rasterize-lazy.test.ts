import { beforeEach, describe, expect, it, vi } from "vitest";

const mupdfMocks = vi.hoisted(() => ({
  documentDestroy: vi.fn(),
  failRenderAt: new Set<number>(),
  loadPage: vi.fn(),
  pageDestroy: vi.fn(),
  pixmapDestroy: vi.fn(),
}));

vi.mock("mupdf", () => ({
  ColorSpace: { DeviceRGB: Symbol("DeviceRGB") },
  Document: {
    openDocument: () => ({
      countPages: () => 6,
      destroy: mupdfMocks.documentDestroy,
      loadPage: (index: number) => {
        mupdfMocks.loadPage(index);
        return {
          destroy: mupdfMocks.pageDestroy,
          toPixmap: () => {
            if (mupdfMocks.failRenderAt.has(index)) {
              throw new Error(`render failed at page ${index + 1}`);
            }
            return {
              asPNG: () => new Uint8Array([index + 1]),
              destroy: mupdfMocks.pixmapDestroy,
            };
          },
        };
      },
    }),
  },
  Matrix: { scale: () => Symbol("matrix") },
}));

const { processPdfPagesWithMeta } = await import("../pdf-rasterize");

describe("lazy PDF page rasterization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mupdfMocks.failRenderAt.clear();
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
    );

    await vi.waitFor(() => expect(started).toHaveLength(4));
    expect(mupdfMocks.loadPage).toHaveBeenCalledTimes(4);

    releasePages(true);
    await expect(processing).resolves.toMatchObject({
      results: ["page-1", "page-2", "page-3", "page-4", "page-5", "page-6"],
    });
    expect(mupdfMocks.loadPage).toHaveBeenCalledTimes(6);
  });

  it("stops assigning pages when rendering fails", async () => {
    mupdfMocks.failRenderAt.add(0);

    await expect(
      processPdfPagesWithMeta(
        new Uint8Array([1, 2, 3]),
        { concurrency: 4, maxPages: 6, scale: 2 },
        () => Promise.resolve("unreachable"),
      ),
    ).rejects.toThrow("render failed at page 1");

    expect(mupdfMocks.loadPage).toHaveBeenCalledTimes(1);
    expect(mupdfMocks.documentDestroy).toHaveBeenCalledTimes(1);
  });
});
