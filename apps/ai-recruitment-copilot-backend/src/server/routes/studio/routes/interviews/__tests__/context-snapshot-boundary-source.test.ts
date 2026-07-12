import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const agentEvidenceSource = readFileSync(
  new URL("../../../../agent/utils/evidence-snapshot.ts", import.meta.url),
  "utf-8",
);
const resumesReadRouteSource = readFileSync(
  new URL("../../resumes/read-route.ts", import.meta.url),
  "utf-8",
);
const interviewsRouteSource = readFileSync(new URL("../route.ts", import.meta.url), "utf-8");
const interviewsCollectionRouteSource = readFileSync(
  new URL("../collection-route.ts", import.meta.url),
  "utf-8",
);
const interviewsDetailRouteSource = readFileSync(
  new URL("../detail-route.ts", import.meta.url),
  "utf-8",
);

describe("interview context snapshot creation boundary", () => {
  it("keeps creation on launch/transition/reset paths only", () => {
    const agentInstructionsSource = interviewsDetailRouteSource.slice(
      interviewsDetailRouteSource.indexOf('.get("/:id/agent-instructions"'),
      interviewsDetailRouteSource.indexOf(
        "buildAgentInstructions",
        interviewsDetailRouteSource.indexOf("/:id/agent-instructions"),
      ),
    );
    const launchInterviewSource = resumesReadRouteSource.slice(
      resumesReadRouteSource.indexOf('.post(\n    "/:id/launch-interview"'),
      resumesReadRouteSource.indexOf(
        "return c.json(detail, 201);",
        resumesReadRouteSource.indexOf("/:id/launch-interview"),
      ),
    );
    const resetRoundSource = interviewsRouteSource.slice(
      interviewsRouteSource.indexOf('.post("/:id/reset"'),
      interviewsRouteSource.indexOf(
        "invalidateStudioInterviewCaches",
        interviewsRouteSource.indexOf("/:id/reset"),
      ),
    );
    const resetSubmissionSource = interviewsDetailRouteSource.slice(
      interviewsDetailRouteSource.indexOf('"/:id/form-submissions/:submissionId"'),
      interviewsDetailRouteSource.indexOf(
        ".patch(",
        interviewsDetailRouteSource.indexOf("/:submissionId"),
      ),
    );

    expect(launchInterviewSource).toContain("launchAiInterviewRound");
    expect(interviewsCollectionRouteSource).toContain("createInterviewContextSnapshot(tx");
    expect(interviewsRouteSource).toContain("refreshInterviewContextSnapshot(tx");
    expect(interviewsDetailRouteSource).toContain("refreshInterviewContextSnapshot(tx");
    expect(resetRoundSource).toContain("refreshInterviewContextSnapshot(tx");
    expect(resetRoundSource).toContain('reason: "reset"');
    expect(resetRoundSource).toContain("scheduleEntryId: roundId");
    expect(resetRoundSource).toContain('candidateRow.pipelineStage !== "ai_interview"');
    expect(resetRoundSource).not.toContain('scheduleRow.status !== "completed"');
    expect(resetRoundSource).not.toContain("只能重置已结束的轮次");
    expect(resetSubmissionSource).toContain("refreshInterviewContextSnapshot(tx");
    expect(resetSubmissionSource).toContain('reason: "manual_refresh"');
    expect(resetSubmissionSource).toContain('reason: "form_submission_reset"');
    expect(resetSubmissionSource).toContain("scheduleEntryId: roundId");
    expect(agentInstructionsSource).not.toContain("loadOrCreateActiveInterviewContextSnapshot");
    expect(agentEvidenceSource).not.toContain("loadOrCreateActiveInterviewContextSnapshot");
  });
});
