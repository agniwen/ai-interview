import type { ResumeLibraryListRecord } from "@arc/shared/studio-resumes";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  STUDIO_DATE_GROUP_ROW_HEIGHT,
  buildStudioDateGroupedVirtualRows,
  buildStudioStickyDateHeaderPositions,
} from "../../studio-date-group-virtual-list";

describe("resume library virtual list", () => {
  it("builds one date header across loaded page boundaries", () => {
    // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
    const records = [
      { createdAt: "2026-08-14T16:20:00.000Z", id: "page-1-today" },
      { createdAt: "2026-08-14T16:10:00.000Z", id: "page-2-today" },
      { createdAt: "2026-08-14T15:50:00.000Z", id: "page-2-yesterday" },
    ] as ResumeLibraryListRecord[];

    expect(
      buildStudioDateGroupedVirtualRows(
        records,
        "createdAt",
        new Date("2026-08-14T16:30:00.000Z"),
      ).map((row) => (row.type === "date-header" ? row.label : row.record.id)),
    ).toEqual(["今天", "page-1-today", "page-2-today", "昨天", "page-2-yesterday"]);

    const rows = buildStudioDateGroupedVirtualRows(
      records,
      "createdAt",
      new Date("2026-08-14T16:30:00.000Z"),
    );
    expect(STUDIO_DATE_GROUP_ROW_HEIGHT).toBe(56);
    expect(buildStudioStickyDateHeaderPositions(rows, 217)).toEqual([
      { index: 0, start: 0 },
      { index: 3, start: 490 },
    ]);
  });

  it("keeps non-date sorting unchanged without date headers", () => {
    // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
    const records = [
      { createdAt: "2026-08-14T15:50:00.000Z", id: "candidate-a" },
      { createdAt: "2026-08-14T16:20:00.000Z", id: "candidate-b" },
    ] as ResumeLibraryListRecord[];

    expect(
      buildStudioDateGroupedVirtualRows(
        records,
        "structuredScore",
        new Date("2026-08-14T16:30:00.000Z"),
      ).map((row) => (row.type === "date-header" ? row.label : row.record.id)),
    ).toEqual(["candidate-a", "candidate-b"]);
  });

  it("keeps sticky date headers and records inside one fixed-height virtual list", async () => {
    const [source, sharedSource] = await Promise.all([
      readFile(new URL("../resume-library-page-list.tsx", import.meta.url), "utf-8"),
      readFile(new URL("../../studio-date-group-virtual-list.tsx", import.meta.url), "utf-8"),
    ]);

    expect(sharedSource).toContain("defaultRangeExtractor");
    expect(source).toContain("buildStudioDateGroupedVirtualRows");
    expect(source).toContain("StudioStickyDateGroupHeader");
    expect(source).toContain("StudioDateGroupHeaderSkeleton");
    expect(source).toContain('row.type === "date-header"');
    expect(source).toContain("rangeExtractor");
    expect(source).not.toContain("measureElement");
  });
});
