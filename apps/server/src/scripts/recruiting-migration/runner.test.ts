import { describe, expect, it } from "vitest";
import { runMigration } from "./runner";
import type { Query } from "./runner";

describe("migration database protection", () => {
  it.each([
    { actual: "other", confirmed: "ainterview", expected: "ainterview" },
    { actual: "ainterview", confirmed: undefined, expected: "ainterview" },
    { actual: "ainterview", confirmed: "ainterview-dev", expected: "ainterview" },
    { actual: "other", confirmed: "other", expected: "other" },
  ])("rejects unsafe target before locks or writes: $actual / $confirmed", async (target) => {
    const statements: string[] = [];
    const query: Query = (sql) => {
      statements.push(sql);
      return Promise.resolve([{ database: target.actual }]);
    };
    await expect(
      runMigration(query, {
        apply: true,
        confirmedDatabase: target.confirmed,
        expectedDatabase: target.expected,
      }),
    ).rejects.toThrow();
    expect(statements).toEqual(["SELECT current_database() AS database"]);
  });

  it.each([
    { confirmed: "ainterview", expected: "ainterview" },
    { confirmed: undefined, expected: "ainterview-dev" },
  ])("acquires migration lock for explicit valid target: $expected", async (target) => {
    const statements: string[] = [];
    const query: Query = (sql) => {
      statements.push(sql);
      if (statements.length === 1) {
        return Promise.resolve([{ database: target.expected }]);
      }
      return Promise.reject(new Error("stop at lock"));
    };
    await expect(
      runMigration(query, {
        apply: true,
        confirmedDatabase: target.confirmed,
        expectedDatabase: target.expected,
      }),
    ).rejects.toThrow("stop at lock");
    expect(statements[1]).toBe("SELECT pg_advisory_xact_lock(718401256)");
  });
});
