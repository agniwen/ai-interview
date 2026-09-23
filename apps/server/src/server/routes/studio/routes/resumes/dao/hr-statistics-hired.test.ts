import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadHrStatistics } from "./hr-statistics";

const mockDatabase = vi.hoisted(() => ({
  rows: new Array<object[]>(),
  selectIndex: 0,
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Keep the real HR statistic projection and aggregation while supplying deterministic database rows for rollback history.
vi.mock("../../../../../../lib/server/db/index", () => ({
  db: {
    select: () => {
      const rows = mockDatabase.rows[mockDatabase.selectIndex] ?? [];
      mockDatabase.selectIndex += 1;
      const query = Object.assign(Promise.resolve(rows), {
        from: () => query,
        innerJoin: () => query,
        where: () => Promise.resolve(rows),
      });
      return query;
    },
  },
}));

const date = (value: string) => new Date(`${value}T04:00:00.000Z`);

function hiredEvent(id: string, at: string, joiningDate: string, ownerId: string) {
  return {
    action: "recruiting_closed",
    at: date(at),
    detail: { actualJoiningDate: joiningDate, metricOwnerId: ownerId },
    fromStage: "onboarding",
    id,
    recordId: "record-1",
    toOutcome: "hired",
    toStage: "closed",
  };
}

const reopenedEvent = {
  action: "recruiting_reopened",
  at: date("2026-09-12"),
  detail: { metricOwnerId: "hr-2" },
  fromStage: "closed",
  id: "reopened",
  recordId: "record-1",
  toOutcome: "in_pipeline",
  toStage: "onboarding",
};

function setRows(
  outcome: "hired" | "in_pipeline",
  events: (ReturnType<typeof hiredEvent> | typeof reopenedEvent)[],
  joined: string | null,
) {
  mockDatabase.rows = [
    [
      {
        candidateName: "测试候选人",
        createdAt: date("2026-08-01"),
        createdBy: "hr-1",
        currentStage: outcome === "hired" ? "closed" : "onboarding",
        id: "record-1",
        jobId: null,
        outcome,
        ownerId: "hr-2",
        resumeId: null,
        stageEnteredAt: date("2026-09-12"),
      },
    ],
    events,
    [],
    [],
    [],
    [
      { id: "hr-1", name: "原负责 HR" },
      { id: "hr-2", name: "现负责 HR" },
    ],
    [{ actualJoiningDate: joined, recordId: "record-1" }],
  ];
  mockDatabase.selectIndex = 0;
}

function statistics(from = "2026-09-01", to = "2026-09-30") {
  return loadHrStatistics(
    {
      from,
      now: date("2026-09-23"),
      organizationId: "organization-1",
      period: "custom",
      to,
    },
    { kind: "all" },
  );
}

describe("HR 统计中的已入职确认", () => {
  beforeEach(() => {
    mockDatabase.rows = [];
    mockDatabase.selectIndex = 0;
  });

  it("回退撤销入职后不再把旧入职事件计入历史期间", async () => {
    setRows(
      "in_pipeline",
      [hiredEvent("first-hire", "2026-09-10", "2026-09-10", "hr-1"), reopenedEvent],
      null,
    );

    const result = await statistics();

    expect(result.team.find((row) => row.stage === "hired")?.count).toBe(0);
    expect(result.details.some((entry) => entry.metric === "hired")).toBe(false);
  });

  it("再次确认入职时按新的实际日期和当时负责 HR 计一次", async () => {
    setRows(
      "hired",
      [
        hiredEvent("first-hire", "2026-09-10", "2026-09-10", "hr-1"),
        reopenedEvent,
        hiredEvent("second-hire", "2026-09-20", "2026-09-21", "hr-2"),
      ],
      "2026-09-21",
    );

    const result = await statistics();
    const hires = result.details.filter((entry) => entry.metric === "hired");

    expect(result.team.find((row) => row.stage === "hired")?.count).toBe(1);
    expect(hires).toMatchObject([
      { at: "2026-09-20T16:00:00.000Z", hrId: "hr-2", id: "second-hire" },
    ]);
  });

  it("再次确认入职后不会在旧入职日期所在的周期重复出现", async () => {
    setRows(
      "hired",
      [
        hiredEvent("first-hire", "2026-09-10", "2026-09-10", "hr-1"),
        reopenedEvent,
        hiredEvent("second-hire", "2026-09-20", "2026-09-21", "hr-2"),
      ],
      "2026-09-21",
    );

    const result = await statistics("2026-09-01", "2026-09-15");

    expect(result.team.find((row) => row.stage === "hired")?.count).toBe(0);
    expect(result.details.some((entry) => entry.metric === "hired")).toBe(false);
  });
});
