import type { Database } from "@app/database";
import { describe, expect, it, vi } from "vitest";
import { bindResumeProcessingDatabase, db } from "./database";

interface MarkerDatabase {
  marker(): string;
}

function databaseWithMarker(marker: string): Database {
  // SAFETY: Object.create returns an untyped empty object; this focused scope test reads only the marker attached below.
  const database = Object.create(null) as Database & MarkerDatabase;
  database.marker = vi.fn(() => marker);
  return database;
}

async function readMarker() {
  await Promise.resolve();
  // SAFETY: Every database bound by this test is created by `databaseWithMarker` and supplies this method.
  return (db as Database & MarkerDatabase).marker();
}

describe("resume processing database scope", () => {
  it("keeps concurrently bound runtimes isolated", async () => {
    const readFirst = bindResumeProcessingDatabase(databaseWithMarker("first"), readMarker);
    const readSecond = bindResumeProcessingDatabase(databaseWithMarker("second"), readMarker);

    await expect(Promise.all([readFirst(), readSecond()])).resolves.toEqual(["first", "second"]);
  });

  it("rejects an internal database access outside an explicit runtime scope", () => {
    expect(() => db.select()).toThrow("Resume processing database scope is unavailable.");
  });
});
