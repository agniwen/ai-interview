import { describe, expect, it, vi } from "vitest";
import {
  fetchJobDescriptionsByCodes,
  jobDescriptionIdsExist,
  listAllJobDescriptions,
  loadJobDescriptionById,
} from "../dao";

interface EmptyQuery extends PromiseLike<never[]> {
  $dynamic: () => EmptyQuery;
  from: () => EmptyQuery;
  leftJoin: () => EmptyQuery;
  limit: () => EmptyQuery;
  offset: () => EmptyQuery;
  orderBy: () => EmptyQuery;
  where: () => EmptyQuery;
}

const mocks = vi.hoisted(() => {
  const emptyRows = Promise.resolve([]);
  // SAFETY: This fixture implements every Drizzle chain method exercised by the four compatibility exports below.
  const query = {} as EmptyQuery;
  query.$dynamic = vi.fn(() => query);
  query.from = vi.fn(() => query);
  query.leftJoin = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.offset = vi.fn(() => query);
  query.orderBy = vi.fn(() => query);
  // oxlint-disable-next-line unicorn/no-thenable -- Drizzle query builders are intentionally awaitable; this fixture faithfully models that contract.
  query.then = emptyRows.then.bind(emptyRows);
  query.where = vi.fn(() => query);
  return {
    database: {
      select: vi.fn(() => query),
    },
  };
});

// oxlint-disable-next-line anti-slop/no-module-mocking -- This facade test must replace the process-wide Server database while preserving the package's real AsyncLocalStorage boundary.
vi.mock("../../../../../../lib/server/db", () => ({ db: mocks.database }));

describe("job description DAO compatibility exports", () => {
  it("run inside the Server database scope", async () => {
    await expect(loadJobDescriptionById("org-1", "missing")).resolves.toBeNull();
    await expect(listAllJobDescriptions("org-1")).resolves.toEqual([]);
    await expect(jobDescriptionIdsExist(["missing"], "org-1")).resolves.toBe(false);
    await expect(fetchJobDescriptionsByCodes("org-1", ["JD-1"])).resolves.toEqual([]);
  });
});
