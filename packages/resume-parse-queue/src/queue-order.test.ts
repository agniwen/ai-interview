import { describe, expect, it, vi } from "vitest";
import {
  loadNewestQueueJobsPage,
  paginateNewestQueueJobs,
  sortQueueJobsNewestFirst,
} from "./queue-order";

describe("queue job ordering", () => {
  it("paginates jobs across states by creation time from newest to oldest", () => {
    const jobs = [
      { id: "completed-old", timestamp: 100 },
      { id: "waiting-new", timestamp: 400 },
      { id: "failed-middle", timestamp: 300 },
      { id: "active-recent", timestamp: 200 },
    ];

    expect(paginateNewestQueueJobs(jobs, 1, 2).map((job) => job.id)).toEqual([
      "waiting-new",
      "failed-middle",
    ]);
    expect(paginateNewestQueueJobs(jobs, 2, 2).map((job) => job.id)).toEqual([
      "active-recent",
      "completed-old",
    ]);
    expect(jobs.map((job) => job.id)).toEqual([
      "completed-old",
      "waiting-new",
      "failed-middle",
      "active-recent",
    ]);
  });

  it("sorts a full mixed-state scan without mutating the input", () => {
    const jobs = [
      { id: "completed-old", timestamp: 100 },
      { id: "waiting-new", timestamp: 400 },
      { id: "failed-middle", timestamp: 300 },
    ];

    expect(sortQueueJobsNewestFirst(jobs).map((job) => job.id)).toEqual([
      "waiting-new",
      "failed-middle",
      "completed-old",
    ]);
    expect(jobs.map((job) => job.id)).toEqual(["completed-old", "waiting-new", "failed-middle"]);
  });

  it("loads every requested state before applying global ordering and pagination", async () => {
    const jobs = [
      { id: "completed-old", timestamp: 100 },
      { id: "waiting-new", timestamp: 400 },
      { id: "failed-middle", timestamp: 300 },
      { id: "active-recent", timestamp: 200 },
    ];
    const getJobs = vi.fn(() => Promise.resolve(jobs));

    await expect(
      loadNewestQueueJobsPage({ getJobs }, ["waiting", "active", "completed", "failed"], 2, 2),
    ).resolves.toEqual([
      { id: "active-recent", timestamp: 200 },
      { id: "completed-old", timestamp: 100 },
    ]);
    expect(getJobs).toHaveBeenCalledWith(
      ["waiting", "active", "completed", "failed"],
      0,
      -1,
      false,
    );
  });
});
