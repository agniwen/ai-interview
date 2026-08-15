import type { ResumePoolListRecord } from "@arc/shared/resume-pool";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../resume-pool-details", () => ({
  ResumePoolCard: ({ record }: { record: { id: string } }) =>
    createElement("article", { "data-record-id": record.id }),
}));

describe("resume pool list SSR boundary", () => {
  it("loads without evaluating the client-only masonry package", async () => {
    const listModule = await import("../resume-pool-list");

    expect(listModule.ResumePoolListContent).toBeTypeOf("function");
  });

  it("keeps existing cards fully opaque while more records load", async () => {
    const { ResumePoolListContent } = await import("../resume-pool-list");
    const markup = renderToStaticMarkup(
      createElement(ResumePoolListContent, {
        canDeletePoolRecords: false,
        canImportToLibrary: false,
        canPublishToPool: false,
        canResetFilters: false,
        canRetryResumeParse: false,
        canUpload: false,
        currentOrganizationId: null,
        currentUserId: null,
        deleting: false,
        emptyTitle: "",
        isInitialPoolLoading: false,
        onDelete: () => {},
        onImport: () => {},
        onOpenDetail: () => {},
        onOpenDuplicateMatches: () => {},
        onOpenPdf: () => {},
        onPublish: () => {},
        onRetryParse: () => {},
        onUpload: () => {},
        publishing: false,
        records: [
          {
            createdAt: "2026-08-14T16:00:00.000Z",
            createdBy: null,
            id: "resume-1",
          } as ResumePoolListRecord,
        ],
        retriedRecordIds: new Set<string>(),
        retryingRecordId: null,
        scope: "public",
        showEmptyState: false,
      }),
    );

    expect(markup).not.toContain("opacity-60");
    expect(markup).toContain(
      "group sticky top-[calc(var(--header-height)+0.5rem)] z-10 flex w-fit items-center gap-2 rounded-r-[12px] border border-transparent px-4 py-2 transition-colors hover:border-input hover:bg-sidebar/70",
    );
    expect(markup).toContain("-translate-x-4 group-hover:translate-x-0");
    expect(markup).toContain("scroll-mt-[calc(var(--header-height)+0.5rem)]");
    expect(markup).not.toContain("backdrop-blur-md");
  });
});
