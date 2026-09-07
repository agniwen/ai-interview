import { listTrashedMeetingSessions } from "../server/routes/meetings/lifecycle-dao";
import { trashedMeetingListQuerySchema } from "@app/shared/meeting-recording";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  candidate,
  humanInterviewMeeting,
  meetingSession,
  member,
  organization,
  recruitingEvaluationDocument,
  recruitingInitialInterview,
  recruitingNodeState,
  recruitingRecord,
  recruitingMeetingContext,
  meetingSearchProjection,
  user,
} from "@app/db-schema/schema";
import type { RecruitingNode } from "@app/db-schema/schema";
import type { InitialInterviewSnapshot } from "@app/shared/human-initial-interview";
import { closeDatabase, db } from "../lib/server/db";
import {
  listMeetingSessionsForAccess,
  loadMeetingSessionForAccess,
} from "../server/routes/meetings/dao";
import { searchMeetingSessionsForAccess } from "../server/routes/meetings/routes/search/dao";
import { listMeetingRecruitingRecordCandidates } from "../server/routes/meetings/recruiting-context-dao";
import { saveInitialInterviewSnapshot } from "../server/routes/studio/routes/resumes/routes/initial-interviews/dao";

const testUrl = process.env.RECRUITING_TEST_DATABASE_URL;
const suite = testUrl ? describe : describe.skip;
let testDatabaseSelected = false;
const orgId = `echo-scope-${crypto.randomUUID()}`;
const actorId = crypto.randomUUID();
const now = new Date();
const snapshot: InitialInterviewSnapshot = {
  candidateName: "测试候选人",
  durationMs: 1000,
  interviewQuestions: [],
  job: null,
  qualitativeResumeEvaluation: null,
  recordedAt: now.toISOString(),
  recording: { contentType: "audio/mp4", sizeBytes: 10, storageKey: "test/snapshot" },
  resume: null,
  resumeEmploymentContext: "",
  resumeText: "简历",
  sourceMeetingId: "echo",
  sourceTranscriptRevisionId: "revision",
  title: "录音",
  turns: [],
};
async function record(stage: RecruitingNode | "closed") {
  const id = crypto.randomUUID();
  await db.insert(candidate).values({ id, name: "测试候选人", organizationId: orgId });
  await db.insert(recruitingRecord).values({
    candidateId: id,
    closedAt: stage === "closed" ? now : null,
    currentStage: stage,
    id,
    organizationId: orgId,
    outcome: stage === "closed" ? "rejected" : "in_pipeline",
  });
  return id;
}
function save(recruitingRecordId: string, id = crypto.randomUUID()) {
  return saveInitialInterviewSnapshot({
    actorId,
    id,
    organizationId: orgId,
    overwriteDocumentId: null,
    recruitingRecordId,
    snapshot,
  });
}
suite("Echo recording scope and initial interview import", () => {
  beforeAll(async () => {
    if (!testUrl || !new URL(testUrl).pathname.includes("test")) {
      throw new Error("An isolated test database is required");
    }
    process.env.DATABASE_URL = testUrl;
    testDatabaseSelected = true;
    await db.insert(organization).values({ createdAt: now, id: orgId, name: "测试", slug: orgId });
    await db.insert(user).values({
      createdAt: now,
      email: `${actorId}@example.invalid`,
      emailVerified: true,
      id: actorId,
      name: "HR",
      updatedAt: now,
    });
    await db.insert(member).values({
      createdAt: now,
      id: crypto.randomUUID(),
      organizationId: orgId,
      role: "owner",
      userId: actorId,
    });
  });
  afterAll(async () => {
    if (!testDatabaseSelected) {
      return;
    }
    await db.delete(organization).where(eq(organization.id, orgId));
    await db.delete(user).where(eq(user.id, actorId));
    await closeDatabase();
  });
  it("filters candidate stages and existing documents before limiting search", async () => {
    const screening = await record("screening");
    const ai = await record("ai_interview");
    await record("second_interview");
    await record("final_interview");
    await record("closed");
    const documented = await record("ai_interview");
    await db.insert(recruitingEvaluationDocument).values({
      documentId: "doc",
      organizationId: orgId,
      providerId: "test",
      recruitingRecordId: documented,
    });
    const rows = await listMeetingRecruitingRecordCandidates({
      limit: 50,
      organizationId: orgId,
      purpose: "initial-interview",
      visibilityScope: { kind: "all" },
    });
    expect(rows.map((row) => row.id).toSorted()).toEqual([screening, ai].toSorted());
  });
  it("advances screening atomically and represents it as a human initial interview", async () => {
    const id = await record("screening");
    await save(id);
    const [saved] = await db.select().from(recruitingRecord).where(eq(recruitingRecord.id, id));
    expect(saved?.currentStage).toBe("ai_interview");
    const sources = await db
      .select()
      .from(recruitingInitialInterview)
      .where(eq(recruitingInitialInterview.recruitingRecordId, id));
    expect(sources).toHaveLength(1);
    const nodes = await db
      .select()
      .from(recruitingNodeState)
      .where(eq(recruitingNodeState.recruitingRecordId, id));
    expect(nodes.find((node) => node.node === "screening")?.result).toBe("pass");
    await expect(save(id)).rejects.toThrow("已有评价表或人工初面");
    const rows = await listMeetingRecruitingRecordCandidates({
      limit: 50,
      organizationId: orgId,
      purpose: "initial-interview",
      visibilityScope: { kind: "all" },
    });
    expect(rows.some((row) => row.id === id)).toBe(false);
  });
  it("rejects stale selections and rolls back stage advancement when snapshot insertion fails", async () => {
    const human = await record("second_interview");
    await expect(save(human)).rejects.toThrow("只能选择");
    const documented = await record("screening");
    await db.insert(recruitingEvaluationDocument).values({
      documentId: "doc",
      organizationId: orgId,
      providerId: "test",
      recruitingRecordId: documented,
    });
    await expect(save(documented)).rejects.toThrow("已有评价表");
    const first = await record("ai_interview");
    const duplicate = crypto.randomUUID();
    await save(first, duplicate);
    const second = await record("screening");
    await expect(save(second, duplicate)).rejects.toThrow();
    const [unchanged] = await db
      .select()
      .from(recruitingRecord)
      .where(eq(recruitingRecord.id, second));
    expect(unchanged?.currentStage).toBe("screening");
  });
  it("excludes human interview processing from Echo lists and search, while retaining provenance in details", async () => {
    const voice = crypto.randomUUID();
    const human = crypto.randomUUID();
    await db.insert(meetingSession).values(
      [voice, human].map((id) => ({
        clientSessionId: id,
        id,
        manifestSha256: "test",
        organizationId: orgId,
        ownerId: actorId,
        savedAt: now,
        startedAt: now,
        status: "ready" as const,
        title: "同名录音",
      })),
    );
    await db.insert(humanInterviewMeeting).values({
      id: crypto.randomUUID(),
      organizationId: orgId,
      processingMeetingSessionId: human,
      title: "真人面试",
    });
    const linkedRecord = await record("ai_interview");
    await db.insert(recruitingMeetingContext).values({
      linkedBy: actorId,
      meetingId: voice,
      organizationId: orgId,
      recruitingRecordId: linkedRecord,
    });
    await db.insert(meetingSearchProjection).values(
      [voice, human].map((meetingId) => ({
        meetingId,
        organizationId: orgId,
        searchText: "同名录音",
      })),
    );
    const access = { includeAllPrivateMeetings: true, organizationId: orgId, userId: actorId };
    const rows = await listMeetingSessionsForAccess(access);
    expect(rows.map((row) => row.id)).toEqual([voice]);
    expect(rows[0]?.recordingType).toBe("voice_recording");
    const results = await searchMeetingSessionsForAccess({
      limit: 20,
      organizationId: orgId,
      query: "同名",
      timeZone: "UTC",
      userId: actorId,
    });
    expect(results.records.map((row) => row.id)).toEqual([voice]);
    const humanDetail = await loadMeetingSessionForAccess({ ...access, meetingId: human });
    expect(humanDetail?.recordingType).toBe("human_interview");
    await db
      .update(meetingSession)
      .set({
        purgeAfter: new Date(now.getTime() + 86_400_000),
        status: "trashed",
        trashedAt: now,
        trashedFromStatus: "ready",
      })
      .where(inArray(meetingSession.id, [voice, human]));
    const trash = await listTrashedMeetingSessions({
      ...trashedMeetingListQuerySchema.parse({}),
      actorId,
      organizationId: orgId,
    });
    expect(trash.total).toBe(1);
    expect(trash.records.map((row) => row.id)).toEqual([voice]);
  });
});
