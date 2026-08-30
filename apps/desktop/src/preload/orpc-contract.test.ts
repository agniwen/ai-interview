import { describe, expect, it } from "vitest";
import { desktopSettingsSchema } from "./orpc-contract";

describe("desktopSettingsSchema", () => {
  it("carries the persisted transparent background preference", () => {
    expect(
      desktopSettingsSchema.parse({
        notifyOnFinish: false,
        theme: "system",
        transparentBackground: false,
      }),
    ).toEqual({
      notifyOnFinish: false,
      theme: "system",
      transparentBackground: false,
    });
  });
});
