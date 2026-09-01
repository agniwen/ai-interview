import { describe, expect, it } from "vitest";
import { envFileNames, resolveServerEnvDir } from "./env";

describe("server env ownership", () => {
  it("uses Vite's mode-specific precedence", () => {
    expect(envFileNames("production")).toEqual([
      ".env.production.local",
      ".env.production",
      ".env.local",
      ".env",
    ]);
  });

  it("always resolves to apps/server", () => {
    expect(resolveServerEnvDir("production")).toMatch(/\/apps\/server$/);
  });
});
