import { expect, it } from "vitest";
import { buildInterviewContextSnapshotPayload } from "../../studio/routes/interviews/dao/context-snapshots";

it("excludes private job fields from candidate and voice context even if a caller supplies a full job", () => {
  const job = {
    id: "job-1",
    internalCriteria: "仅内部：招聘行业经验",
    name: "产品经理",
    prompt: "公开岗位 JD",
  };
  const payload = buildInterviewContextSnapshotPayload({
    candidate: {
      candidateEmail: null,
      candidateName: "候选人",
      candidatePhone: null,
      resumeProfile: null,
      targetRole: null,
    },
    createdAt: "2026-09-14T00:00:00.000Z",
    forms: [],
    globalConfig: { closingInstructions: null, companyContext: null, openingInstructions: null },
    interviewRecordId: "record-1",
    interviewers: [],
    jobDescription: job,
    personalizedQuestions: [],
    questionTemplates: [],
    scheduleEntryId: null,
  });
  expect(payload.jobDescription).toMatchObject({ id: "job-1", prompt: "公开岗位 JD" });
  expect(JSON.stringify(payload)).not.toContain("internalCriteria");
  expect(JSON.stringify(payload)).not.toContain("仅内部");
});
