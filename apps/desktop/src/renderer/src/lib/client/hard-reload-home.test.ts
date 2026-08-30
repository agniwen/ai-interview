import { describe, expect, it, vi } from "vitest";
import { DESKTOP_HOME_HASH, hardReloadToHome } from "./hard-reload-home";

describe("hardReloadToHome", () => {
  it("replaces the hash with the app home and force-reloads", () => {
    const location = {
      href: "http://localhost:5173/#/meetings/abc",
      reload: vi.fn(),
      replace: vi.fn(),
    };

    hardReloadToHome(location);

    expect(location.replace).toHaveBeenCalledWith(`http://localhost:5173/${DESKTOP_HOME_HASH}`);
    expect(location.reload).toHaveBeenCalledOnce();
  });

  it("only reloads when the window is already on the home hash", () => {
    const location = {
      href: `http://localhost:5173/${DESKTOP_HOME_HASH}`,
      reload: vi.fn(),
      replace: vi.fn(),
    };

    hardReloadToHome(location);

    expect(location.replace).not.toHaveBeenCalled();
    expect(location.reload).toHaveBeenCalledOnce();
  });
});
