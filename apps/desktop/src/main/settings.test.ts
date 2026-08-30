import { describe, expect, it, vi } from "vitest";
import { applySettingsAtStartup, resolveDesktopSettings } from "./settings";

describe("resolveDesktopSettings", () => {
  it("keeps transparent backgrounds enabled for settings saved before the preference existed", () => {
    expect(resolveDesktopSettings({ notifyOnFinish: false, theme: "system" })).toEqual({
      notifyOnFinish: false,
      theme: "system",
      transparentBackground: true,
    });
  });
});

describe("applySettingsAtStartup", () => {
  it("applies the persisted snapshot without mutating operating-system login items", () => {
    const applySettings = vi.fn();
    const settings = {
      notifyOnFinish: false,
      theme: "system" as const,
      transparentBackground: true,
    };

    applySettingsAtStartup({ applySettings, readSettings: () => settings });

    expect(applySettings).toHaveBeenCalledWith(settings);
  });
});
