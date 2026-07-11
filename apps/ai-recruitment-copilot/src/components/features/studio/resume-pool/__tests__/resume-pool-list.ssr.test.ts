import { describe, expect, it } from "vitest";

describe("resume pool list SSR boundary", () => {
  it("loads without evaluating the client-only masonry package", async () => {
    const listModule = await import("../resume-pool-list");

    expect(listModule.ResumePoolListContent).toBeTypeOf("function");
  });
});
