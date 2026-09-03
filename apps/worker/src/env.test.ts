import { describe, expect, it } from "vitest";
import { createWorkerEnv, getWorkerConnectionSummary } from "./env";

describe("createWorkerEnv", () => {
  it("accepts an empty environment because readiness owns dependency requirements", () => {
    expect(createWorkerEnv({})).toMatchObject({});
  });

  it("rejects malformed configured values", () => {
    expect(() => createWorkerEnv({ WORKER_PORT: "not-a-port" })).toThrow();
    expect(() => createWorkerEnv({ REDIS_URL: "not-a-url" })).toThrow();
  });
});

describe("getWorkerConnectionSummary", () => {
  it("redacts credentials while keeping connection identity", () => {
    expect(
      getWorkerConnectionSummary({
        DATABASE_URL: "postgres://user:secret@db.example/arc",
      }).databaseUrl,
    ).toEqual({
      host: "db.example",
      pathname: "/arc",
      protocol: "postgres:",
      usesPassword: true,
      usesUsername: true,
    });
  });
});
