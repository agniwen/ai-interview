import { beforeEach, describe, expect, it, vi } from "vitest";
import { applySettingsAtStartup } from "./settings";

const electronMocks = vi.hoisted(() => ({
  getPath: vi.fn(() => "/tmp/meeting-buddy-settings-test"),
  setLoginItemSettings: vi.fn(),
}));

vi.mock("electron", () => ({
  app: electronMocks,
  nativeTheme: { themeSource: "system" },
}));

describe("applySettingsAtStartup", () => {
  beforeEach(() => {
    electronMocks.setLoginItemSettings.mockClear();
  });

  it("does not mutate operating-system login items", () => {
    applySettingsAtStartup();

    expect(electronMocks.setLoginItemSettings).not.toHaveBeenCalled();
  });
});
