import { describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { configureAppIdentity } from "./app-identity";

const app = {
  getPath: vi.fn((name: string) => (name === "appData" ? "/profiles" : "/profiles/dev")),
  isPackaged: true,
  setName: vi.fn(),
  setPath: vi.fn(),
};

describe("Echo application identity", () => {
  it("keeps the installed profile and browser session after renaming", () => {
    vi.clearAllMocks();
    app.isPackaged = true;
    configureAppIdentity(app);

    expect(app.setPath).toHaveBeenCalledWith("userData", join("/profiles", "Meeting Buddy"));
    expect(app.setPath).toHaveBeenCalledWith("sessionData", join("/profiles", "Meeting Buddy"));
    expect(app.setName).toHaveBeenCalledWith("Echo");
  });

  it("keeps development data separate from the installed profile", () => {
    vi.clearAllMocks();
    app.isPackaged = false;
    configureAppIdentity(app);

    expect(app.setPath).toHaveBeenCalledWith("userData", "/profiles/dev");
    expect(app.setPath).toHaveBeenCalledWith("sessionData", "/profiles/dev");
    expect(app.setName).toHaveBeenCalledWith("Echo");
  });
});
