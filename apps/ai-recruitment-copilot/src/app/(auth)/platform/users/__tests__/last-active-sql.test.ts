import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const USERS_ROUTE_DIR = resolve(import.meta.dirname, "..");

function readUsersRouteFile(path: string) {
  return readFileSync(resolve(USERS_ROUTE_DIR, path), "utf-8");
}

describe("platform users last active SQL", () => {
  it("keeps page timestamptz activity aggregates as real instants", () => {
    const source = readUsersRouteFile("page.tsx");

    expect(source).not.toContain("AT TIME ZONE 'UTC'");
  });
});
