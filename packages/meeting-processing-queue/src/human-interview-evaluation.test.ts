import { describe, expect, it } from "vitest";
import {
  buildHumanInterviewEvaluationJobId,
  humanInterviewEvaluationJobSchema,
} from "./human-interview-evaluation";

describe("human interview evaluation queue contract", () => {
  it("按轮次和转录版本生成幂等任务", () => {
    const job = {
      meetingSessionId: "meeting-session-1",
      organizationId: "org-1",
      roundId: "round-1",
      transcriptRevisionId: "revision-1",
    };
    expect(humanInterviewEvaluationJobSchema.parse(job)).toEqual(job);
    expect(buildHumanInterviewEvaluationJobId(job)).not.toBe(
      buildHumanInterviewEvaluationJobId({ ...job, transcriptRevisionId: "revision-2" }),
    );
  });
});
