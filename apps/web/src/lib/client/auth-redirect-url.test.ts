import { describe, expect, it } from "vitest";
import { toWebAbsoluteUrl } from "./auth-redirect-url";

describe("toWebAbsoluteUrl", () => {
  it("resolves relative OAuth callbacks against the web origin", () => {
    expect(toWebAbsoluteUrl("/?goto=studio", "http://localhost:3000")).toBe(
      "http://localhost:3000/?goto=studio",
    );
  });

  it("keeps absolute OAuth callbacks unchanged", () => {
    expect(toWebAbsoluteUrl("https://example.com/studio", "http://localhost:3000")).toBe(
      "https://example.com/studio",
    );
  });
});
