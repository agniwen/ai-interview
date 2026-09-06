import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { digest, key, stableId, table } from "./model";
import type { CopyItem, Row } from "./model";
import { buildMigrationPlan } from "./transform";
import { compactValues, jsonBatches, verifyExisting } from "./runner";
const now = "2026-09-05T00:00:00+00:00";
function record(overrides: Row = {}): Row {
  return {
    ...Object.fromEntries(
      getTableConfig(table("studioInterview")).columns.map((c) => [c.name, null]),
    ),
    candidate_name: "甲",
    created_at: now,
    id: "r1",
    interview_questions: [],
    organization_id: "org",
    outcome: "in_pipeline",
    pipeline_stage: "screening",
    resume_parse_status: "ready",
    resume_review_status: "idle",
    resume_screening_status: "idle",
    skills_normalized: [],
    updated_at: now,
    ...overrides,
  };
}
function build(main: Row, extra: [string, Row[]][] = []) {
  return buildMigrationPlan(new Map([["studioInterview", [main]], ...extra]), {
    inferLegacyNodes: true,
  });
}
const items = (plan: ReturnType<typeof build>, name: string) =>
  plan.items.filter((i) => i.targetName === name).map((i) => i.row);
describe("recruiting data conversion", () => {
  it("keeps separate identities and never merges matching names", () => {
    const plan = buildMigrationPlan(
      new Map([["studioInterview", [record(), record({ id: "r2" })]]]),
      {},
    );
    expect(items(plan, "candidate").map((r) => r.id)).toEqual([
      stableId("candidate", "r1"),
      stableId("candidate", "r2"),
    ]);
    expect(items(plan, "recruitingRecord").map((r) => r.id)).toEqual(["r1", "r2"]);
  });
  it("direct AI import skips screening without inventing a pass and numeric round order selects 10", () => {
    const plan = build(record({ pipeline_stage: "ai_interview" }), [
      [
        "studioInterviewSchedule",
        [
          {
            id: "round2",
            interview_record_id: "r1",
            organization_id: "org",
            sort_order: 2,
            status: "completed",
          },
          {
            id: "round10",
            interview_record_id: "r1",
            organization_id: "org",
            sort_order: 10,
            status: "completed",
          },
        ],
      ],
    ]);
    expect(items(plan, "recruitingNodeState").find((r) => r.node === "screening")).toMatchObject({
      result: null,
      status: "skipped",
    });
    expect(items(plan, "recruitingNodeState").find((r) => r.node === "ai_interview")).toMatchObject(
      { effective_ai_round_id: "round10", result: null, status: "awaiting_review" },
    );
  });
  it("preserves a successful old artifact while queued re-evaluation uses the actual qualitative contract", () => {
    const artifact = { engine: { engineVersion: "a", promptVersion: "b" }, schemaVersion: 1 };
    const plan = build(
      record({
        resume_evaluation_artifact_mode: "structured",
        resume_evaluation_attempt_mode: "qualitative",
        resume_review_queued_at: now,
        resume_review_run_id: "run2",
        resume_review_status: "queued",
        structured_resume_evaluation: artifact,
      }),
    );
    const evaluation = items(plan, "recruitingResumeEvaluation");
    expect(evaluation.find((r) => r.status === "succeeded")?.artifact).toEqual(artifact);
    expect(evaluation.find((r) => r.status === "queued")).toMatchObject({
      contract_version: "qualitative-v2",
      run_id: "run2",
      started_at: now,
    });
    expect(items(plan, "recruitingRecord")[0]?.current_evaluation_id).not.toEqual(
      items(plan, "recruitingRecord")[0]?.active_evaluation_id,
    );
  });
  it("screening failure retains its last successful result separately", () => {
    const plan = build(
      record({
        resume_screening_error: "timeout",
        resume_screening_result: { verdict: "pass" },
        resume_screening_status: "failed",
      }),
    );
    expect(items(plan, "recruitingResumeEvaluation").map((r) => r.status)).toEqual([
      "succeeded",
      "failed",
    ]);
    expect(
      items(plan, "recruitingNodeState").find((r) => r.node === "screening")?.result,
    ).toBeNull();
  });
  it("uses explicit final labels, preserves cancellation and inconclusive decisions", () => {
    const plan = build(record({ pipeline_stage: "human_interview" }), [
      [
        "studioHumanInterviewRound",
        [
          {
            id: "h1",
            interview_record_id: "r1",
            label: "123",
            organization_id: "org",
            outcome: "inconclusive",
            sort_order: 1,
            status: "completed",
          },
          {
            id: "h2",
            interview_record_id: "r1",
            label: "总监终面",
            organization_id: "org",
            sort_order: 2,
            status: "cancelled",
          },
        ],
      ],
    ]);
    expect(items(plan, "humanInterviewRound")[1]).toMatchObject({
      round_kind: "final_interview",
      status: "cancelled",
    });
    expect(items(plan, "recruitingRecord")[0]?.current_stage).toBe("second_interview");
    expect(
      items(plan, "recruitingNodeState").find((r) => r.node === "second_interview"),
    ).toMatchObject({ result: null, status: "awaiting_review" });
  });
  it("repairs only a unique same-owner reverse conversation reference in the new copy", () => {
    const conversation = {
      conversation_id: "c1",
      interview_record_id: "r1",
      organization_id: "org",
      schedule_entry_id: null,
    };
    const plan = build(record(), [
      [
        "studioInterviewSchedule",
        [
          {
            conversation_id: "c1",
            id: "a1",
            interview_record_id: "r1",
            organization_id: "org",
            sort_order: 1,
          },
        ],
      ],
      ["interviewConversation", [conversation]],
    ]);
    expect(items(plan, "aiInterviewConversation")[0]?.ai_round_id).toBe("a1");
    expect(conversation.schedule_entry_id).toBeNull();
    expect(plan.decisions.some((d) => d.sourceTable === "interview_conversation")).toBe(true);
  });
  it("keeps closed metadata and records inference without manufacturing intermediate passes", () => {
    const plan = build(
      record({
        closed_at: now,
        closed_meta: { hiredDetails: { actualJoiningDate: "2026-09-06" }, previousStage: "offer" },
        outcome: "hired",
        pipeline_stage: "closed",
      }),
    );
    expect(items(plan, "recruitingRecord")[0]).toMatchObject({
      close_reason: "onboarded",
      closed_from_node: "onboarding",
      current_stage: "closed",
    });
    expect(items(plan, "recruitingFulfillment")[0]?.actual_joining_date).toBe("2026-09-06");
    expect(
      items(plan, "recruitingNodeState")
        .filter((r) => r.result === "pass")
        .map((r) => r.node),
    ).toEqual(["onboarding"]);
    expect(items(plan, "recruitingEvent")[0]).toMatchObject({
      detail: { legacySource: { closed_meta: { previousStage: "offer" } } },
      from_stage: "closed",
      to_stage: "closed",
    });
  });
});
describe("append-only migration ledger", () => {
  const source = record();
  const row = { id: "new1", name: "甲" };
  const item: CopyItem = {
    row,
    source,
    sourceKey: key("studioInterview", source),
    sourceName: "studioInterview",
    targetName: "candidate",
  };
  const ledger = {
    source_hash: JSON.stringify({
      source: digest({ source, target: row }),
      target: digest(row),
      version: 1,
    }),
    target_key: key("candidate", row),
  };
  it("recognizes an unchanged copy", () => expect(verifyExisting(item, row, ledger)).toBe(true));
  it("blocks new runtime updates, source changes and unmanaged rows", () => {
    expect(() => verifyExisting(item, { ...row, name: "乙" }, ledger)).toThrow("Target changed");
    expect(() =>
      verifyExisting({ ...item, source: { ...source, notes: "new" } }, row, ledger),
    ).toThrow("Source or mapping changed");
    expect(() => verifyExisting(item, row)).toThrow("Unmanaged");
    expect(() => verifyExisting(item, undefined, ledger)).toThrow("deleted");
  });
});

describe("database-side copy payload", () => {
  it("keeps large artifacts in PostgreSQL and transmits only a field reference", () => {
    const artifact = { text: "中文".repeat(20_000) };
    const source = { artifact, id: "history1" };
    const item: CopyItem = {
      row: { artifact, id: "history1", status: "succeeded" },
      source,
      sourceKey: key("resumeEvaluationVersion", source),
      sourceName: "resumeEvaluationVersion",
      targetName: "recruitingResumeEvaluation",
    };
    const packed = compactValues(item, false);
    expect(packed.fields).toMatchObject({ artifact: "artifact" });
    expect(Buffer.byteLength(JSON.stringify(packed))).toBeLessThan(1024);
  });
  it("uses UTF8 bytes rather than character counts for batch limits", () => {
    const rows = [{ text: "中".repeat(30_000) }, { text: "文".repeat(30_000) }];
    const batches = jsonBatches(rows);
    expect(batches.map((batch) => batch.length)).toEqual([1, 1]);
    for (const batch of batches) {
      expect(Buffer.byteLength(JSON.stringify(batch))).toBeLessThanOrEqual(128 * 1024);
    }
  });
});
