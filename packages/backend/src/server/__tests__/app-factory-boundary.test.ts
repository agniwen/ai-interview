import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../");

function readSource(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf-8");
}

describe("Hono app factory boundary", () => {
  it("exports the Hono app type from a factory instead of a prebuilt singleton", () => {
    const source = readSource("server/app.ts");

    expect(source).toContain("export function createServerApp");
    expect(source).toContain("export type AppType = ReturnType<typeof createServerApp>");
    expect(source).not.toContain("export const app =");
  });
});
