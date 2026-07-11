import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const candidateRouteSource = readFileSync(new URL("../route.ts", import.meta.url), "utf-8");
const studioInterviewsRouteSource = readFileSync(
  new URL("../../studio/routes/interviews/detail-route.ts", import.meta.url),
  "utf-8",
);

describe("interview dispatch contract boundary", () => {
  it("builds participant metadata through the versioned shared contract", () => {
    const tokenRouteSource = candidateRouteSource.slice(
      candidateRouteSource.indexOf('.post("/:id/:roundId/livekit-token"'),
      candidateRouteSource.indexOf('.get("/:id/resolve"'),
    );

    expect(tokenRouteSource).toContain("buildInterviewDispatchMetadata({");
    expect(tokenRouteSource).toContain("selectInterviewDispatchInterviewer(");
    expect(tokenRouteSource).not.toContain("candidate_name:");
    expect(tokenRouteSource).not.toContain("interviewers:");
    expect(tokenRouteSource).not.toContain("job_description_prompt:");
  });

  it("builds studio previews through the same contract builder", () => {
    const previewRouteSource = studioInterviewsRouteSource.slice(
      studioInterviewsRouteSource.indexOf('.get("/:id/agent-instructions"'),
      studioInterviewsRouteSource.indexOf('.route("/:id/reports"'),
    );

    expect(previewRouteSource).toContain("buildInterviewDispatchContract({");
    expect(previewRouteSource).toContain("instructions: contract.prompts.system");
    expect(previewRouteSource).not.toContain("buildAgentInstructions({");
  });
});
