import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../../../../lib/server/db/index";
import {
  meetingAccessGrant,
  meetingIntelligenceRevision,
  meetingProcessingRun,
  meetingRecordingAsset,
  meetingSession,
  meetingTranscriptRevision,
  meetingTranscriptTurn,
  member,
  organization,
  user,
} from "@arc/db-schema/schema";
import { loadMeetingExportContext, loadMeetingExportTurnsPage } from "./dao";

const SUFFIX = String(process.pid);
const ORGANIZATION_ID = `meeting_export_org_${SUFFIX}`;
const OWNER_ID = `meeting_export_owner_${SUFFIX}`;
const VIEWER_ID = `meeting_export_viewer_${SUFFIX}`;
const HIDDEN_ID = `meeting_export_hidden_${SUFFIX}`;
const ADMIN_ID = `meeting_export_admin_${SUFFIX}`;
const MEETING_ID = `meeting_export_meeting_${SUFFIX}`;
const FINAL_REVISION_ID = `meeting_export_final_${SUFFIX}`;
const HUMAN_REVISION_ID = `meeting_export_human_${SUFFIX}`;
const STALE_INTELLIGENCE_ID = `meeting_export_intelligence_${SUFFIX}`;

function memberId(userId: string) {
  return `${userId}_member`;
}

async function clean() {
  await db.delete(organization).where(eq(organization.id, ORGANIZATION_ID));
  await db.delete(user).where(inArray(user.id, [OWNER_ID, VIEWER_ID, HIDDEN_ID, ADMIN_ID]));
}

describe("Meeting export DAO", () => {
  beforeEach(async () => {
    await clean();
    const now = new Date("2026-08-09T03:00:00.000Z");
    await db.insert(user).values(
      [OWNER_ID, VIEWER_ID, HIDDEN_ID, ADMIN_ID].map((id) => ({
        createdAt: now,
        email: `${id}@example.test`,
        emailVerified: true,
        id,
        name: id,
        updatedAt: now,
      })),
    );
    await db.insert(organization).values({
      createdAt: now,
      id: ORGANIZATION_ID,
      name: "Meeting Export Test",
      slug: `meeting-export-test-${SUFFIX}`,
    });
    await db.insert(member).values(
      [OWNER_ID, VIEWER_ID, HIDDEN_ID, ADMIN_ID].map((userId) => ({
        createdAt: now,
        id: memberId(userId),
        organizationId: ORGANIZATION_ID,
        role: userId === ADMIN_ID ? "admin" : "member",
        userId,
      })),
    );
    await db.insert(meetingSession).values({
      id: MEETING_ID,
      manifestSha256: "a".repeat(64),
      organizationId: ORGANIZATION_ID,
      ownerId: OWNER_ID,
      savedAt: now,
      startedAt: new Date(now.getTime() - 60_000),
      status: "ready",
      title: "权威版本导出",
      visibility: "restricted",
    });
    await db.insert(meetingProcessingRun).values({
      attempt: 1,
      finishedAt: now,
      id: `meeting_export_run_${SUFFIX}`,
      idempotencyKey: `meeting-export-run-${SUFFIX}`,
      meetingId: MEETING_ID,
      model: "whisper-1",
      organizationId: ORGANIZATION_ID,
      pipelineVersion: "transcription-v1",
      provider: "openai",
      region: "global",
      stage: "final-transcription",
      status: "succeeded",
    });
    await db.insert(meetingTranscriptRevision).values([
      {
        id: FINAL_REVISION_ID,
        kind: "final",
        language: "zh",
        meetingId: MEETING_ID,
        model: "whisper-1",
        organizationId: ORGANIZATION_ID,
        pipelineVersion: "transcription-v1",
        processingRunId: `meeting_export_run_${SUFFIX}`,
        provider: "openai",
        region: "global",
        revision: 1,
        sourceManifestSha256: "a".repeat(64),
      },
      {
        basedOnRevisionId: FINAL_REVISION_ID,
        createdBy: OWNER_ID,
        id: HUMAN_REVISION_ID,
        kind: "human",
        language: "zh",
        meetingId: MEETING_ID,
        model: "whisper-1",
        organizationId: ORGANIZATION_ID,
        pipelineVersion: "transcription-v1",
        provider: "openai",
        region: "global",
        revision: 2,
        sourceManifestSha256: "a".repeat(64),
      },
    ]);
    await db.insert(meetingTranscriptTurn).values([
      {
        endMs: 900,
        id: `meeting_export_old_turn_${SUFFIX}`,
        revisionId: FINAL_REVISION_ID,
        sequence: 0,
        speakerDisplayName: "机器说话人",
        speakerKey: "remote:0",
        startMs: 100,
        text: "旧机器文本",
        track: "remote",
      },
      {
        endMs: 1000,
        id: `meeting_export_human_turn_0_${SUFFIX}`,
        revisionId: HUMAN_REVISION_ID,
        sequence: 0,
        speakerDisplayName: "候选人",
        speakerKey: "remote:0",
        startMs: 100,
        text: "人工修订第一句",
        track: "remote",
      },
      {
        endMs: 2200,
        id: `meeting_export_human_turn_1_${SUFFIX}`,
        revisionId: HUMAN_REVISION_ID,
        sequence: 1,
        speakerDisplayName: "面试官",
        speakerKey: "local:0",
        startMs: 1100,
        text: "人工修订第二句",
        track: "local",
      },
    ]);
    await db.insert(meetingProcessingRun).values({
      attempt: 1,
      finishedAt: now,
      id: `meeting_export_intelligence_run_${SUFFIX}`,
      idempotencyKey: `meeting-export-intelligence-run-${SUFFIX}`,
      inputTranscriptRevisionId: FINAL_REVISION_ID,
      meetingId: MEETING_ID,
      model: "gpt-5-mini",
      organizationId: ORGANIZATION_ID,
      pipelineVersion: "intelligence-v1",
      promptVersion: "meeting-intelligence-v1",
      provider: "openai",
      region: "global",
      requestKind: "automatic",
      stage: "meeting-intelligence",
      status: "succeeded",
      templateKey: "general",
    });
    await db.insert(meetingIntelligenceRevision).values({
      content: {
        actionItems: [],
        decisions: [],
        openQuestions: [],
        summary: "旧机器转录上的 Intelligence",
        template: "general",
        topics: [],
      },
      id: STALE_INTELLIGENCE_ID,
      meetingId: MEETING_ID,
      model: "gpt-5-mini",
      organizationId: ORGANIZATION_ID,
      processingRunId: `meeting_export_intelligence_run_${SUFFIX}`,
      promptVersion: "meeting-intelligence-v1",
      provider: "openai",
      revision: 1,
      templateKey: "general",
      transcriptRevisionId: FINAL_REVISION_ID,
    });
    await db.insert(meetingRecordingAsset).values({
      contentType: "audio/webm",
      durationMs: 2200,
      fragmentCount: 0,
      id: `meeting_export_playback_${SUFFIX}`,
      meetingId: MEETING_ID,
      sha256: "b".repeat(64),
      sizeBytes: 1024,
      status: "ready",
      storageKey: `meeting-export/${SUFFIX}/playback.webm`,
      track: "playback",
      uploadMode: "derived",
      verifiedAt: now,
    });
    await db
      .update(meetingSession)
      .set({
        activeIntelligenceRevisionId: STALE_INTELLIGENCE_ID,
        activeTranscriptRevisionId: HUMAN_REVISION_ID,
        intelligenceStatus: "pending",
      })
      .where(eq(meetingSession.id, MEETING_ID));
    await db.insert(meetingAccessGrant).values({
      createdBy: OWNER_ID,
      id: `meeting_export_grant_${SUFFIX}`,
      meetingId: MEETING_ID,
      memberId: memberId(VIEWER_ID),
      organizationId: ORGANIZATION_ID,
      role: "viewer",
    });
  }, 30_000);

  afterEach(clean, 30_000);

  it("allows only the current owner or administrator and hides inaccessible meetings", async () => {
    await expect(
      loadMeetingExportContext({
        meetingId: MEETING_ID,
        organizationId: ORGANIZATION_ID,
        userId: OWNER_ID,
      }),
    ).resolves.toMatchObject({
      activeIntelligenceRevisionId: STALE_INTELLIGENCE_ID,
      intelligence: null,
      kind: "authorized",
      transcript: { id: HUMAN_REVISION_ID },
    });
    await expect(
      loadMeetingExportContext({
        meetingId: MEETING_ID,
        organizationId: ORGANIZATION_ID,
        userId: ADMIN_ID,
      }),
    ).resolves.toMatchObject({ kind: "authorized" });
    await expect(
      loadMeetingExportContext({
        meetingId: MEETING_ID,
        organizationId: ORGANIZATION_ID,
        userId: VIEWER_ID,
      }),
    ).resolves.toEqual({ kind: "forbidden" });
    await expect(
      loadMeetingExportContext({
        meetingId: MEETING_ID,
        organizationId: ORGANIZATION_ID,
        userId: HIDDEN_ID,
      }),
    ).resolves.toEqual({ kind: "not-found" });
  });

  it("pages only the captured authoritative revision in stable turn order", async () => {
    await expect(
      loadMeetingExportTurnsPage({
        afterSequence: -1,
        expectedIntelligenceRevisionId: STALE_INTELLIGENCE_ID,
        limit: 1,
        meetingId: MEETING_ID,
        organizationId: ORGANIZATION_ID,
        revisionId: HUMAN_REVISION_ID,
        userId: OWNER_ID,
      }),
    ).resolves.toMatchObject({
      kind: "authorized",
      turns: [{ sequence: 0, text: "人工修订第一句" }],
    });
    await expect(
      loadMeetingExportTurnsPage({
        afterSequence: 0,
        expectedIntelligenceRevisionId: STALE_INTELLIGENCE_ID,
        limit: 10,
        meetingId: MEETING_ID,
        organizationId: ORGANIZATION_ID,
        revisionId: HUMAN_REVISION_ID,
        userId: OWNER_ID,
      }),
    ).resolves.toMatchObject({
      kind: "authorized",
      turns: [{ sequence: 1, text: "人工修订第二句" }],
    });
  });

  it("revokes later pages after membership or snapshot authority changes", async () => {
    await db
      .update(member)
      .set({ role: "noAccess" })
      .where(eq(member.id, memberId(OWNER_ID)));
    await expect(
      loadMeetingExportTurnsPage({
        afterSequence: -1,
        expectedIntelligenceRevisionId: STALE_INTELLIGENCE_ID,
        limit: 10,
        meetingId: MEETING_ID,
        organizationId: ORGANIZATION_ID,
        revisionId: HUMAN_REVISION_ID,
        userId: OWNER_ID,
      }),
    ).resolves.toEqual({ kind: "revoked" });
  });
});
