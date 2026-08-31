import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("recording draft transcript layout", () => {
  it("reuses the live transcript panel for active and interrupted recording states", () => {
    const source = readFileSync(join(import.meta.dirname, "meeting-detail-page.tsx"), "utf-8");

    expect(source).toContain("header={renderDetailHeader(null)}");
    expect(source).toContain("isInterruptedSession && localDraft");
    expect(source).toContain("header={renderDetailHeader(status)}");
    expect(source).not.toContain("meeting-interrupted-transcript-scroll-content");
    expect(source).not.toContain("scrollable={isInterruptedSession}");
  });
});
