import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(new URL("../route-runtime.ts", import.meta.url), "utf-8");

function queryBeforeLimit(declaration: string): string {
  const start = routeSource.indexOf(`function ${declaration}`);
  const end = routeSource.indexOf(".limit(RECOVERY_BATCH_SIZE);", start);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return routeSource.slice(start, end);
}

describe("report generation recovery queries", () => {
  it("filters exhausted or orphaned summary jobs before applying the batch limit", () => {
    const query = queryBeforeLimit("listSummaryRetryCandidates");

    expect(query).toContain("isNotNull(interviewConversation.interviewRecordId)");
    expect(query).toContain("lt(interviewConversation.summaryAttempts, RECOVERY_MAX_ATTEMPTS)");
  });

  it("filters exhausted or orphaned key-information jobs before applying the batch limit", () => {
    const query = queryBeforeLimit("listKeyInformationRetryCandidates");

    expect(query).toContain("isNotNull(interviewConversation.interviewRecordId)");
    expect(query).toContain(
      "lt(interviewConversation.keyInformationAttempts, RECOVERY_MAX_ATTEMPTS)",
    );
  });
});
