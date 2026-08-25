import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("resume library retry policy", () => {
  it("does not impose a session-local retry limit on failed records", async () => {
    const [listSource, queriesSource] = await Promise.all([
      readFile(new URL("../resume-library-page-list.tsx", import.meta.url), "utf-8"),
      readFile(new URL("../use-resume-library-page-queries.ts", import.meta.url), "utf-8"),
    ]);

    expect(listSource).toContain("canRetryResumeParse={canRetryResumeParse}");
    expect(listSource).not.toContain("retriedRecordIds");
    expect(queriesSource).not.toContain("retriedRecordIds");
  });
});
