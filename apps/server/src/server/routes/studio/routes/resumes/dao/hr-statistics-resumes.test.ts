import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadHrStatistics } from "./hr-statistics";

const mockDatabase = vi.hoisted(() => ({
  rows: new Array<object[]>(),
  selectIndex: 0,
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Exercise the complete HR projection with controlled resume versions and pool-import rows.
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

const at = (day: number) => new Date(`2026-09-${String(day).padStart(2, "0")}T04:00:00.000Z`);

function record(id: string, candidateId: string, sourcePoolItemId: string | null, day: number) {
  return {
    candidateId,
    candidateName: id,
    createdAt: at(day),
    createdBy: id === "record-1" ? "hr-1" : "hr-2",
    currentStage: "screening",
    id,
    jobId: "job-1",
    outcome: "in_pipeline",
    ownerId: "hr-2",
    resumeId: `resume-${id === "record-1" ? "1" : "2"}`,
    sourcePoolItemId,
    stageEnteredAt: at(day),
  };
}

function creationEvent(id: string, resumeId: string, ownerId: string, day: number) {
  return {
    action: "recruiting_record_created",
    at: at(day),
    detail: {
      metricDepartmentId: "department-1",
      metricJobDescriptionId: "job-1",
      metricOwnerId: ownerId,
      resumeId,
    },
    fromStage: "screening",
    id: `created-${id}`,
    recordId: id,
    toOutcome: "in_pipeline",
    toStage: "screening",
  };
}

function resume(id: string, candidateId: string, createdBy: string, day: number) {
  return {
    at: at(day),
    candidateId,
    candidateName: candidateId,
    createdBy,
    id,
    parsedAt: at(day),
  };
}

function setRows(
  records: ReturnType<typeof record>[],
  events: ReturnType<typeof creationEvent>[],
  resumes: ReturnType<typeof resume>[],
) {
  mockDatabase.rows = [
    records,
    events,
    resumes,
    [{ departmentId: "department-1", id: "job-1", name: "测试岗位" }],
    [{ id: "department-1", name: "测试部门" }],
    [
      { id: "hr-1", name: "HR 甲" },
      { id: "hr-2", name: "HR 乙" },
    ],
    [],
    records.map(({ candidateId, createdAt, id, sourcePoolItemId }) => ({
      candidateId,
      createdAt,
      id,
      sourcePoolItemId,
    })),
  ];
  mockDatabase.selectIndex = 0;
}

function statistics(visibility?: { kind: "all" } | { kind: "restricted"; userIds: string[] }) {
  return loadHrStatistics(
    {
      from: "2026-09-01",
      now: at(23),
      organizationId: "organization-1",
      period: "custom",
      to: "2026-09-30",
    },
    visibility ?? { kind: "all" },
  );
}

describe("HR 统计中的首次成功入库简历", () => {
  beforeEach(() => {
    mockDatabase.rows = [];
    mockDatabase.selectIndex = 0;
  });

  it("第一版失败后第二版首次成功时，计入并保留首次入库的 HR 和岗位归属", async () => {
    setRows(
      [record("record-1", "candidate-1", null, 2)],
      [creationEvent("record-1", "resume-1", "hr-1", 2)],
      [resume("resume-2", "candidate-1", "hr-1", 10)],
    );

    const result = await statistics();

    expect(result.team[0]?.count).toBe(1);
    expect(result.details.filter((entry) => entry.metric === "resumes")).toMatchObject([
      { hrId: "hr-1", id: "resume-2", jobId: "job-1" },
    ]);
  });

  it("同一简历池来源重新导入只计首次成功的一份", async () => {
    const records = [
      record("record-1", "candidate-1", "pool-1", 2),
      record("record-2", "candidate-2", "pool-1", 10),
    ];
    setRows(
      records,
      [
        creationEvent("record-1", "resume-1", "hr-1", 2),
        creationEvent("record-2", "resume-2", "hr-2", 10),
      ],
      [resume("resume-1", "candidate-1", "hr-1", 2), resume("resume-2", "candidate-2", "hr-2", 10)],
    );

    const result = await statistics();

    expect(result.team[0]?.count).toBe(1);
    expect(result.details.filter((entry) => entry.metric === "resumes")).toMatchObject([
      { hrId: "hr-1", id: "resume-1" },
    ]);
  });

  it("仅有重新导入对当前 HR 可见时，仍按工作区首次入库去重", async () => {
    const first = record("record-1", "candidate-1", "pool-1", 2);
    const second = record("record-2", "candidate-2", "pool-1", 10);
    const records = [first, second];
    setRows(
      [second],
      [creationEvent("record-2", "resume-2", "hr-2", 10)],
      [resume("resume-1", "candidate-1", "hr-1", 2), resume("resume-2", "candidate-2", "hr-2", 10)],
    );
    mockDatabase.rows[7] = records.map(({ candidateId, createdAt, id, sourcePoolItemId }) => ({
      candidateId,
      createdAt,
      id,
      sourcePoolItemId,
    }));

    const result = await statistics({ kind: "restricted", userIds: ["hr-2"] });

    expect(result.team[0]?.count).toBe(0);
  });
});
