import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { PgAsyncPreparedQuery } from "drizzle-orm/pg-core";
import { relations } from "@app/db-schema/relations";
import { ensureCurrentJobDescriptionVersion } from "./job-description-version";

const database = drizzle("postgres://test:test@127.0.0.1:1/test", { relations });
// Only select/insert builders are used; execution is intercepted before a connection is opened.
const tx = database;
afterEach(() => vi.restoreAllMocks());
afterAll(() => database.$client.end());

describe("job internal criteria versioning", () => {
  it.each([
    { current: "五年行业经验", previous: null },
    { current: "三年行业经验", previous: "五年行业经验" },
    { current: null, previous: "五年行业经验" },
  ])(
    "creates a new snapshot when criteria change: $previous -> $current",
    async ({ previous, current }) => {
      const previousSnapshot = {
        id: "v1",
        internalCriteria: previous,
        jobDescriptionName: "产品经理",
        prompt: "负责产品",
        version: 1,
      };
      const nextSnapshot = { ...previousSnapshot, id: "v2", internalCriteria: current, version: 2 };
      const execute = vi
        .spyOn(PgAsyncPreparedQuery.prototype, "execute")
        .mockResolvedValueOnce([
          {
            internalCriteria: current,
            lifecycleStatus: "published",
            name: "产品经理",
            prompt: "负责产品",
          },
        ])
        .mockResolvedValueOnce([previousSnapshot])
        .mockResolvedValueOnce([nextSnapshot]);
      const result = await ensureCurrentJobDescriptionVersion(tx, {
        jobDescriptionId: "job-1",
        organizationId: "org-1",
      });
      expect(result).toEqual(nextSnapshot);
      expect(execute).toHaveBeenCalledTimes(3);
      expect(previousSnapshot.internalCriteria).toBe(previous);
    },
  );

  it("reuses the snapshot when the JD and criteria are unchanged", async () => {
    const snapshot = {
      id: "v1",
      internalCriteria: null,
      jobDescriptionName: "产品经理",
      prompt: "负责产品",
      version: 1,
    };
    const execute = vi
      .spyOn(PgAsyncPreparedQuery.prototype, "execute")
      .mockResolvedValueOnce([
        {
          internalCriteria: null,
          lifecycleStatus: "published",
          name: "产品经理",
          prompt: "负责产品",
        },
      ])
      .mockResolvedValueOnce([snapshot]);
    expect(
      await ensureCurrentJobDescriptionVersion(tx, {
        jobDescriptionId: "job-1",
        organizationId: "org-1",
      }),
    ).toEqual(snapshot);
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
