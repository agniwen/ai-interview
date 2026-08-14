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
        onSelectionChange: () => {},
        onUpload: () => {},
        publishing: false,
        records: [{ createdBy: null, id: "resume-1" } as ResumePoolListRecord],
        retriedRecordIds: new Set<string>(),
        retryingRecordId: null,
        scope: "public",
        selectedPrivateResumeIds: new Set<string>(),
        selectionDisabled: false,
        showEmptyState: false,
      }),
    );

    expect(markup).not.toContain("opacity-60");
  });
});
