import { describe, expect, it, vi } from "vitest";
import { applySettingsAtStartup } from "./settings";

describe("applySettingsAtStartup", () => {
  it("applies the persisted snapshot without mutating operating-system login items", () => {
    const applySettings = vi.fn();
    const settings = { notifyOnFinish: false, theme: "system" as const };

    applySettingsAtStartup({ applySettings, readSettings: () => settings });

    expect(applySettings).toHaveBeenCalledWith(settings);
  });
});
