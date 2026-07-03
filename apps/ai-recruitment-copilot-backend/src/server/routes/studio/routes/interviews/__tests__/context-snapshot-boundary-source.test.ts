import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const agentEvidenceSource = readFileSync(
  new URL("../../../../agent/utils/evidence-snapshot.ts", import.meta.url),
  "utf-8",
);
const resumesRouteSource = readFileSync(
  new URL("../../resumes/route.ts", import.meta.url),
  "utf-8",
);
const interviewsRouteSource = readFileSync(new URL("../route.ts", import.meta.url), "utf-8");

describe("interview context snapshot creation boundary", () => {
  it("keeps creation on launch/transition/reset paths only", () => {
    const agentInstructionsSource = interviewsRouteSource.slice(
      interviewsRouteSource.indexOf('.get("/:id/agent-instructions"'),
      interviewsRouteSource.indexOf(
        "buildAgentInstructions",
        interviewsRouteSource.indexOf("/:id/agent-instructions"),
      ),
    );
    const launchInterviewSource = resumesRouteSource.slice(
      resumesRouteSource.indexOf('.post(\n    "/:id/launch-interview"'),
      resumesRouteSource.indexOf(
        "return c.json(detail, 201);",
        resumesRouteSource.indexOf("/:id/launch-interview"),
      ),
    );
    const resetRoundSource = interviewsRouteSource.slice(
      interviewsRouteSource.indexOf('.post("/:id/reset"'),
      interviewsRouteSource.indexOf(
        "invalidateStudioInterviewCaches",
        interviewsRouteSource.indexOf("/:id/reset"),
      ),
    );

    expect(launchInterviewSource).toContain("loadOrCreateActiveInterviewContextSnapshot");
    expect(interviewsRouteSource).toContain("createInterviewContextSnapshot(tx");
    expect(interviewsRouteSource).toContain("refreshInterviewContextSnapshot(tx");
    expect(resetRoundSource).toContain("refreshInterviewContextSnapshot(tx");
    expect(resetRoundSource).toContain('reason: "reset"');
    expect(resetRoundSource).toContain("scheduleEntryId: roundId");
    expect(agentInstructionsSource).not.toContain("loadOrCreateActiveInterviewContextSnapshot");
    expect(agentEvidenceSource).not.toContain("loadOrCreateActiveInterviewContextSnapshot");
  });
});
