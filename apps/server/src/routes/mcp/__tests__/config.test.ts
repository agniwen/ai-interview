import { afterEach, describe, expect, it, vi } from "vitest";
import { isMcpEnabled } from "../config";

afterEach(() => vi.unstubAllEnvs());

describe("MCP enablement", () => {
  it("is enabled when the environment variable is absent", () => {
    vi.stubEnv("MCP_ENABLED", "true");
    Reflect.deleteProperty(process.env, "MCP_ENABLED");
    expect(isMcpEnabled()).toBe(true);
  });
  it("can be explicitly disabled", () => {
    vi.stubEnv("MCP_ENABLED", "false");
    expect(isMcpEnabled()).toBe(false);
  });
  it("can be explicitly enabled", () => {
    vi.stubEnv("MCP_ENABLED", "true");
    expect(isMcpEnabled()).toBe(true);
  });
});
