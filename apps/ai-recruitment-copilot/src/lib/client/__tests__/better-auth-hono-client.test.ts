import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = path.resolve(import.meta.dirname, "../../..");

function readSource(relativePath: string) {
  return readFileSync(path.join(srcRoot, relativePath), "utf-8");
}

describe("Better Auth Hono client integration", () => {
  it("keeps the Better Auth React client cookie-aware for Hono-backed auth", () => {
    const source = readSource("lib/client/auth-client.ts");

    expect(source).toContain("VITE_BETTER_AUTH_URL");
    expect(source).toContain('credentials: "include"');
    expect(source).not.toContain("tanstackStartCookies");
  });

  it("sends cookies from frontend API clients to Hono", () => {
    const sources = [readSource("lib/client/rpc.ts"), readSource("lib/client/api/client.ts")].join(
      "\n",
    );

    expect(sources).toContain('credentials: "include"');
    expect(sources).not.toContain('credentials: "same-origin"');
  });
});
