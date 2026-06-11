import { readFileSync } from "node:fs";
import path, { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = path.resolve(import.meta.dirname, "../../../../../..");

function readUsersRouteFile(relativePath: string) {
  return readFileSync(resolve(appRoot, relativePath), "utf-8");
}

describe("platform users last active SQL", () => {
  it("keeps page timestamptz activity aggregates as real instants", () => {
    const source = readUsersRouteFile("src/routes/platform.users.tsx");

    expect(source).not.toContain("AT TIME ZONE 'UTC'");
  });
});
