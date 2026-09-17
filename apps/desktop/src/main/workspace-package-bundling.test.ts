import { describe, expect, it } from "vitest";
import { createDesktopConfig } from "../../electron.vite.config";

describe("desktop main-process workspace packages", () => {
  it("bundles source-only processing contracts and media for native Node", () => {
    const config = createDesktopConfig("development");

    expect(config.main?.build?.externalizeDeps).toEqual({
      exclude: ["@app/shared", "@app/meeting-live-transcript", "@app/meeting-media"],
    });
    expect(config.preload.build.externalizeDeps).toEqual({ exclude: ["@app/shared"] });
  });
});
