import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const APP_SRC = resolve(import.meta.dirname, "../../../..");

function readAppFile(path: string) {
  return readFileSync(resolve(APP_SRC, path), "utf-8");
}

describe("platform users last active SQL", () => {
  it("keeps timestamptz activity aggregates as real instants", () => {
    const files = ["app/(auth)/platform/users/page.tsx", "server/routes/platform/route.ts"].map(
      readAppFile,
    );

    for (const source of files) {
      expect(source).not.toContain("AT TIME ZONE 'UTC'");
    }
  });
});
