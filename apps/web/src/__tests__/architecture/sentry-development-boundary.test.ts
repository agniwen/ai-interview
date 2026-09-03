import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf-8");

describe("Sentry development boundary", () => {
  it("passes NODE_ENV through every web, server, and worker Sentry initializer", () => {
    const initializers = [
      source("../../instrument.client.ts"),
      source("../../instrument.server.ts"),
      source("../../../../server/src/lib/server/sentry.ts"),
      source("../../../../worker/src/sentry.ts"),
    ];

    for (const initializer of initializers) {
      expect(initializer).toContain("nodeEnvironment: process.env.NODE_ENV");
    }
  });
});
