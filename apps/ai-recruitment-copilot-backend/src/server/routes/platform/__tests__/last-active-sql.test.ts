import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const BACKEND_SRC = resolve(import.meta.dirname, "../../../..");

function readBackendFile(path: string) {
  return readFileSync(resolve(BACKEND_SRC, path), "utf-8");
}

describe("platform users last active SQL", () => {
  it("keeps API timestamptz activity aggregates as real instants", () => {
    const files = ["server/routes/platform/route.ts"].map(readBackendFile);

    for (const source of files) {
      expect(source).not.toContain("AT TIME ZONE 'UTC'");
    }
  });
});
