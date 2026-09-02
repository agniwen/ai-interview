import { describe, expect, it } from "vitest";
import { createDesktopConfig } from "../../electron.vite.config";

describe("desktop main-process workspace packages", () => {
  it("bundles the source-only live-transcript package instead of loading it with Node", () => {
    const config = createDesktopConfig("development");

    expect(config.main?.build?.externalizeDeps).toEqual({
      exclude: ["@app/meeting-live-transcript"],
    });
  });
});
