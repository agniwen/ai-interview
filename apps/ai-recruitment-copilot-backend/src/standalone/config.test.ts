import { describe, expect, it } from "vitest";
import { resolveStandaloneServerConfig } from "./config";

describe("resolveStandaloneServerConfig", () => {
  it("uses standalone defaults when host and port are unset", () => {
    expect(resolveStandaloneServerConfig({})).toEqual({
      hostname: "0.0.0.0",
      port: 8787,
    });
  });

  it("reads host and port from the environment", () => {
    expect(
      resolveStandaloneServerConfig({
        HOST: "127.0.0.1",
        PORT: "3100",
      }),
    ).toEqual({
      hostname: "127.0.0.1",
      port: 3100,
    });
  });

  it("rejects invalid port values before starting the server", () => {
    expect(() => resolveStandaloneServerConfig({ PORT: "abc" })).toThrow(
      'Invalid PORT "abc"; expected an integer between 1 and 65535.',
    );
  });
});
