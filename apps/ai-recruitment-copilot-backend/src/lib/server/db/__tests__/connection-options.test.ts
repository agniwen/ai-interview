import { describe, expect, it } from "vitest";
import { getPostgresConnectionOptions } from "../connection-options";

describe("getPostgresConnectionOptions", () => {
  it("uses conservative development defaults", () => {
    expect(getPostgresConnectionOptions({ NODE_ENV: "development" })).toEqual({
      connect_timeout: 10,
      idle_timeout: 60,
      max: 5,
      max_lifetime: 1200,
    });
  });

  it("uses a larger production pool by default", () => {
    expect(getPostgresConnectionOptions({ NODE_ENV: "production" })).toMatchObject({
      max: 10,
    });
  });

  it("allows explicit positive integer overrides", () => {
    expect(
      getPostgresConnectionOptions({
        POSTGRES_CONNECT_TIMEOUT_SECONDS: "3",
        POSTGRES_IDLE_TIMEOUT_SECONDS: "20",
        POSTGRES_MAX_LIFETIME_SECONDS: "300",
        POSTGRES_POOL_MAX: "2",
      }),
    ).toEqual({
      connect_timeout: 3,
      idle_timeout: 20,
      max: 2,
      max_lifetime: 300,
    });
  });

  it("falls back when overrides are missing or invalid", () => {
    expect(
      getPostgresConnectionOptions({
        POSTGRES_CONNECT_TIMEOUT_SECONDS: "0",
        POSTGRES_IDLE_TIMEOUT_SECONDS: "nope",
        POSTGRES_MAX_LIFETIME_SECONDS: "-1",
        POSTGRES_POOL_MAX: "",
      }),
    ).toEqual({
      connect_timeout: 10,
      idle_timeout: 60,
      max: 5,
      max_lifetime: 1200,
    });
  });
});
