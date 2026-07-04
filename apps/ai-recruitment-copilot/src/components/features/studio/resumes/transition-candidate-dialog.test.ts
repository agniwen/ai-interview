import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("transition-candidate-dialog.tsx", import.meta.url), "utf-8");

describe("TransitionCandidateDialog reactivation", () => {
  it("requires a reason, lets HR choose the target stage, and defaults to screening", () => {
    expect(source).toContain('id="reactivation-reason"');
    expect(source).toContain('id="reactivation-target-stage"');
    expect(source).toContain("<Select");
    expect(source).toContain("<SelectTrigger");
    expect(source).toContain("{pipelineStageMeta[targetStage].label}");
    expect(source).toContain("<SelectItem");
    expect(source).toContain("disabled={!isReactivateTargetStageEnabled(stage, resume)}");
    expect(source).toContain("getReachedReactivateStageIndex");
    expect(source).toContain("setReactivationReason");
    expect(source).toContain("setTargetStage");
    expect(source).toContain('useState<ReactivateTargetStage>("screening")');
    expect(source).toContain("reactivationReason: trimmedReason");
    expect(source).toContain("pipelineStage: targetStage");
    expect(source).not.toContain('?? "ai_interview"');
    expect(source).toContain("disabled={submitting || !candidate || !reactivationReason.trim()}");
  });
});
