import type { ResumePoolListRecord } from "@app/shared/resume-pool";
import { describe, expect, it } from "vitest";
import {
  buildResumePoolVirtualRows,
  resolveResumePoolStickyState,
} from "../resume-pool-page-model";

describe("resume pool virtual list", () => {
  it("builds one date header across loaded page boundaries", () => {
    // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
    const records = [
      { createdAt: "2026-08-14T16:20:00.000Z", id: "page-1-today" },
      { createdAt: "2026-08-14T16:10:00.000Z", id: "page-2-today" },
      { createdAt: "2026-08-14T15:50:00.000Z", id: "page-2-yesterday" },
    ] as ResumePoolListRecord[];

    expect(
      buildResumePoolVirtualRows(records, "createdAt", new Date("2026-08-14T16:30:00.000Z")).map(
        (row) => (row.type === "date-header" ? row.label : row.record.id),
      ),
    ).toEqual(["今天", "page-1-today", "page-2-today", "昨天", "page-2-yesterday"]);
  });

  it("keeps non-date sorting unchanged without date headers", () => {
    // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
    const records = [
      { createdAt: "2026-08-14T15:50:00.000Z", id: "candidate-a" },
      { createdAt: "2026-08-14T16:20:00.000Z", id: "candidate-b" },
    ] as ResumePoolListRecord[];

    expect(
      buildResumePoolVirtualRows(
        records,
        "candidateName",
        new Date("2026-08-14T16:30:00.000Z"),
      ).map((row) => (row.type === "date-header" ? row.label : row.record.id)),
    ).toEqual(["candidate-a", "candidate-b"]);
  });

  it("pushes the active header away before switching at the next sticky boundary", () => {
    const positions = [
      { index: 0, start: 0 },
      { index: 3, start: 500 },
      { index: 8, start: 1200 },
    ];

    expect(resolveResumePoolStickyState(positions, 455, 44)).toEqual({
      index: 0,
      isStuck: true,
      pushOffset: 0,
    });
    expect(resolveResumePoolStickyState(positions, 480, 44)).toEqual({
      index: 0,
      isStuck: true,
      pushOffset: -24,
    });
    expect(resolveResumePoolStickyState(positions, 499, 44)).toEqual({
      index: 0,
      isStuck: true,
      pushOffset: -43,
    });
    expect(resolveResumePoolStickyState(positions, 500, 44)).toEqual({
      index: 3,
      isStuck: true,
      pushOffset: 0,
    });
  });
});
