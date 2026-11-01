import { describe, expect, it } from "vitest";
import type { StudioInterviewRecordListRecord } from "@app/shared/studio-interview-rounds";
import { isRoundEditLocked } from "../interview-record-row-guards";

describe("interview editing lifecycle", () => {
  it.each(["ai", "human"] as const)("locks completed %s interviews", (kind) => {
    // SAFETY: The guard only reads kind, status and AI pipelineStage.
    const row = {
      kind,
      pipelineStage: "ai_interview",
      status: "completed",
    } as StudioInterviewRecordListRecord;
    expect(isRoundEditLocked(row)).toBe(true);
  });
  it.each(["ai", "human"] as const)("allows pending %s interviews", (kind) => {
    // SAFETY: The guard only reads kind, status and AI pipelineStage.
    const row = {
      kind,
      pipelineStage: "ai_interview",
      status: "pending",
    } as StudioInterviewRecordListRecord;
    expect(isRoundEditLocked(row)).toBe(false);
  });
  it.each(["ended", "in_progress", "cancelled"])(
    "locks a pending human round with a %s meeting",
    (meetingStatus) => {
      // SAFETY: The guard reads only the supplied lifecycle fields.
      const row = {
        kind: "human",
        meetingStatus,
        status: "pending",
      } as StudioInterviewRecordListRecord;
      expect(isRoundEditLocked(row)).toBe(true);
    },
  );
  it.each(["scheduled", "not_held", null])(
    "allows a pending human round with meeting status %s",
    (meetingStatus) => {
      // SAFETY: The guard reads only the supplied lifecycle fields.
      const row = {
        kind: "human",
        meetingStatus,
        status: "pending",
      } as StudioInterviewRecordListRecord;
      expect(isRoundEditLocked(row)).toBe(false);
    },
  );
  it("keeps AI stage restrictions", () => {
    // SAFETY: The guard only reads kind, status and AI pipelineStage.
    const row = {
      kind: "ai",
      pipelineStage: "offer",
      status: "pending",
    } as StudioInterviewRecordListRecord;
    expect(isRoundEditLocked(row)).toBe(true);
  });
});
