import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const morePageSource = readFileSync(join(import.meta.dirname, "meeting-more-page.tsx"), "utf-8");

describe("Meeting more page", () => {
  it("hides share, export, and the back-to-transcript control", () => {
    expect(morePageSource).not.toContain("MeetingSharePanel");
    expect(morePageSource).not.toContain("MeetingExportPanel");
    expect(morePageSource).not.toContain("返回转录");
  });
});
