import { describe, expect, it } from "vitest";

import { resolveLoadedResumePoolRecords } from "../resume-pool-page-model";

describe("resolveLoadedResumePoolRecords", () => {
  it("uses a completed first-page result before the accumulator effect runs", () => {
    const currentData = [{ id: "new-query-record" }];

    expect(
      resolveLoadedResumePoolRecords({
        accumulated: { records: [], signature: "old-query" },
        currentData,
        isBusy: false,
        page: 1,
        signature: "new-query",
      }),
    ).toEqual(currentData);
  });

  it("does not expose data from a new query while it is still loading", () => {
    expect(
      resolveLoadedResumePoolRecords({
        accumulated: { records: [{ id: "old-query-record" }], signature: "old-query" },
        currentData: [{ id: "new-query-record" }],
        isBusy: true,
        page: 1,
        signature: "new-query",
      }),
    ).toEqual([]);
  });
});
