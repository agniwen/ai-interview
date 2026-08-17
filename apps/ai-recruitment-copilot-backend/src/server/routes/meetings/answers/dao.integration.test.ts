import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  meetingAccessGrant,
  meetingProcessingRun,
  meetingQuestionExchange,
  meetingSession,
  meetingTranscriptRevision,
  meetingTranscriptTurn,
  member,
  organization,
  user,
} from "@arc/db-schema/schema";
import {
  claimMeetingAnswerExchange,
  createMeetingAnswerExchange,
  createMeetingQuestionThread,
  loadMeetingAnswerContext,
  loadMeetingQuestionThread,
  publishMeetingAnswerExchange,
} from "./dao";
import { MEETING_ANSWER_INSUFFICIENT_EVIDENCE_TEXT } from "@arc/shared/meeting-answer";
import type {
  MeetingQuestionExchange,
  MeetingQuestionThreadSummary,
} from "@arc/shared/meeting-answer";

const SUFFIX = String(process.pid);
const ORG_ID = `meeting_answer_org_${SUFFIX}`;

type ExchangeResult = Awaited<ReturnType<typeof createMeetingAnswerExchange>>;
type ThreadResult = Awaited<ReturnType<typeof createMeetingQuestionThread>>;

function isExchange(value: ExchangeResult): value is MeetingQuestionExchange {
  return typeof value !== "string";
}

function isThread(value: ThreadResult): value is MeetingQuestionThreadSummary {
  return typeof value !== "string";
}
const OWNER_ID = `meeting_answer_owner_${SUFFIX}`;
const VIEWER_ID = `meeting_answer_viewer_${SUFFIX}`;
const MEETING_ID = `meeting_answer_meeting_${SUFFIX}`;
const TRANSCRIPT_ID = `meeting_answer_transcript_${SUFFIX}`;
const TURN_ID = `meeting_answer_turn_${SUFFIX}`;

async function clean() {
  await db.delete(organization).where(eq(organization.id, ORG_ID));
  await db.delete(user).where(eq(user.id, OWNER_ID));
  await db.delete(user).where(eq(user.id, VIEWER_ID));
}

function expectExchange(
  value: Awaited<ReturnType<typeof createMeetingAnswerExchange>>,
): MeetingQuestionExchange {
  if (!isExchange(value)) {
    throw new TypeError(`expected exchange, received ${value}`);
  }
  return value;
}

function expectThread(
  value: Awaited<ReturnType<typeof createMeetingQuestionThread>>,
): MeetingQuestionThreadSummary {
  if (!isThread(value)) {
    throw new TypeError(`expected thread, received ${String(value)}`);
  }
  return value;
}

describe("Meeting Answer persistence", () => {
  beforeEach(async () => {
    await clean();
    const now = new Date("2026-08-09T12:30:00.000Z");
    await db.insert(user).values([
      {
        createdAt: now,
        email: `meeting-answer-owner-${SUFFIX}@example.test`,
        emailVerified: true,
        id: OWNER_ID,
        name: "Owner",
        updatedAt: now,
      },
      {
        createdAt: now,
        email: `meeting-answer-viewer-${SUFFIX}@example.test`,
        emailVerified: true,
        id: VIEWER_ID,
        name: "Viewer",
        updatedAt: now,
      },
    ]);
    await db.insert(organization).values({
      createdAt: now,
      id: ORG_ID,
      name: "Meeting Answer Test",
      slug: `meeting-answer-${SUFFIX}`,
    });
    await db.insert(member).values([
      {
        createdAt: now,
        id: `meeting_answer_owner_member_${SUFFIX}`,
        organizationId: ORG_ID,
        role: "member",
        userId: OWNER_ID,
      },
      {
        createdAt: now,
        id: `meeting_answer_viewer_member_${SUFFIX}`,
        organizationId: ORG_ID,
        role: "member",
        userId: VIEWER_ID,
      },
    ]);
    await db.insert(meetingSession).values({
      id: MEETING_ID,
      manifestSha256: "a".repeat(64),
      organizationId: ORG_ID,
      ownerId: OWNER_ID,
      savedAt: now,
      startedAt: now,
      status: "ready",
      title: "Meeting Answer Test",
      transcriptionStatus: "ready",
    });
    const runId = `meeting_answer_transcription_run_${SUFFIX}`;
    await db.insert(meetingProcessingRun).values({
      attempt: 1,
      id: runId,
      idempotencyKey: runId,
      meetingId: MEETING_ID,
      model: "gpt-4o-transcribe-diarize",
      organizationId: ORG_ID,
      pipelineVersion: "final-v1",
      provider: "openai",
      region: "openai-default",
      stage: "final-transcription",
      status: "succeeded",
    });
    await db.insert(meetingTranscriptRevision).values({
      id: TRANSCRIPT_ID,
      kind: "final",
      language: "zh",
      meetingId: MEETING_ID,
      model: "gpt-4o-transcribe-diarize",
      organizationId: ORG_ID,
      pipelineVersion: "final-v1",
      processingRunId: runId,
      provider: "openai",
      region: "openai-default",
      revision: 1,
      sourceManifestSha256: "a".repeat(64),
    });
    await db.insert(meetingTranscriptTurn).values({
      endMs: 9000,
      id: TURN_ID,
      revisionId: TRANSCRIPT_ID,
      sequence: 0,
      speakerKey: "local",
      startMs: 3000,
      text: "支付系统迁移由候选人负责。",
      track: "local",
    });
    await db
      .update(meetingSession)
      .set({ activeTranscriptRevisionId: TRANSCRIPT_ID })
      .where(eq(meetingSession.id, MEETING_ID));
  });

  afterEach(clean);

  it("deduplicates a user question and preserves its sequence placeholder", async () => {
    const thread = expectThread(
      await createMeetingQuestionThread({
        createdBy: OWNER_ID,
        meetingId: MEETING_ID,
        organizationId: ORG_ID,
        title: "项目经验",
      }),
    );
    const input = {
      createdBy: OWNER_ID,
      meetingId: MEETING_ID,
      model: "gpt-5-mini",
      organizationId: ORG_ID,
      promptVersion: "meeting-answer-v1",
      provider: "openai",
      question: "谁负责支付迁移？",
      requestId: "00000000-0000-4000-8000-000000000081",
      threadId: thread.id,
    };

    const first = expectExchange(await createMeetingAnswerExchange(input));
    const duplicate = expectExchange(await createMeetingAnswerExchange(input));

    expect(duplicate).toEqual(first);
    await expect(
      db
        .select()
        .from(meetingQuestionExchange)
        .where(eq(meetingQuestionExchange.threadId, thread.id)),
    ).resolves.toHaveLength(1);
  });

  it("keeps completed answers ordered by the reserved exchange sequence", async () => {
    const thread = expectThread(
      await createMeetingQuestionThread({
        createdBy: OWNER_ID,
        meetingId: MEETING_ID,
        organizationId: ORG_ID,
        title: "项目经验",
      }),
    );
    const create = (requestId: string, question: string) =>
      createMeetingAnswerExchange({
        createdBy: OWNER_ID,
        meetingId: MEETING_ID,
        model: "gpt-5-mini",
        organizationId: ORG_ID,
        promptVersion: "meeting-answer-v1",
        provider: "openai",
        question,
        requestId,
        threadId: thread.id,
      });
    const first = expectExchange(
      await create("00000000-0000-4000-8000-000000000082", "谁负责支付迁移？"),
    );
    await expect(create("00000000-0000-4000-8000-000000000083", "何时开始？")).resolves.toBe(
      "active-question",
    );
    const firstToken = `token-${first.id}`;
    await expect(
      claimMeetingAnswerExchange({
        attempt: 1,
        exchangeId: first.id,
        executionToken: firstToken,
      }),
    ).resolves.toMatchObject({ status: "claimed" });
    await expect(
      publishMeetingAnswerExchange({
        answer: {
          citations: [{ endMs: 9000, startMs: 3000, turnId: TURN_ID }],
          kind: "answer",
          text: "候选人负责。",
        },
        exchangeId: first.id,
        executionToken: firstToken,
      }),
    ).resolves.toBe(true);
    const second = expectExchange(
      await create("00000000-0000-4000-8000-000000000083", "何时开始？"),
    );
    const secondToken = `token-${second.id}`;
    await expect(
      claimMeetingAnswerExchange({
        attempt: 1,
        exchangeId: second.id,
        executionToken: secondToken,
      }),
    ).resolves.toMatchObject({ status: "claimed" });
    await expect(
      publishMeetingAnswerExchange({
        answer: {
          citations: [{ endMs: 9000, startMs: 3000, turnId: TURN_ID }],
          kind: "answer",
          text: "候选人负责。",
        },
        exchangeId: second.id,
        executionToken: secondToken,
      }),
    ).resolves.toBe(true);

    await expect(
      loadMeetingQuestionThread({
        createdBy: OWNER_ID,
        meetingId: MEETING_ID,
        organizationId: ORG_ID,
        threadId: thread.id,
      }),
    ).resolves.toMatchObject({
      exchanges: [
        { id: first.id, sequence: 1, status: "ready" },
        { id: second.id, sequence: 2, status: "ready" },
      ],
    });
  });

  it("refuses to claim a viewer exchange after its meeting grant is revoked", async () => {
    await db.insert(meetingAccessGrant).values({
      id: `meeting_answer_grant_${SUFFIX}`,
      meetingId: MEETING_ID,
      memberId: `meeting_answer_viewer_member_${SUFFIX}`,
      organizationId: ORG_ID,
      role: "viewer",
    });
    const thread = expectThread(
      await createMeetingQuestionThread({
        createdBy: VIEWER_ID,
        meetingId: MEETING_ID,
        organizationId: ORG_ID,
        title: "私有线程",
      }),
    );
    const exchange = expectExchange(
      await createMeetingAnswerExchange({
        createdBy: VIEWER_ID,
        meetingId: MEETING_ID,
        model: "gpt-5-mini",
        organizationId: ORG_ID,
        promptVersion: "meeting-answer-v1",
        provider: "openai",
        question: "谁负责支付迁移？",
        requestId: "00000000-0000-4000-8000-000000000084",
        threadId: thread.id,
      }),
    );
    await db
      .delete(meetingAccessGrant)
      .where(
        and(
          eq(meetingAccessGrant.meetingId, MEETING_ID),
          eq(meetingAccessGrant.memberId, `meeting_answer_viewer_member_${SUFFIX}`),
        ),
      );

    await expect(
      claimMeetingAnswerExchange({
        attempt: 1,
        exchangeId: exchange.id,
        executionToken: "revoked-token",
      }),
    ).resolves.toEqual({ status: "not-authorized" });
  });

  it("does not load meeting content after access is revoked between claim and generation", async () => {
    const memberId = `meeting_answer_viewer_member_${SUFFIX}`;
    await db.insert(meetingAccessGrant).values({
      id: `meeting_answer_race_grant_${SUFFIX}`,
      meetingId: MEETING_ID,
      memberId,
      organizationId: ORG_ID,
      role: "viewer",
    });
    const thread = expectThread(
      await createMeetingQuestionThread({
        createdBy: VIEWER_ID,
        meetingId: MEETING_ID,
        organizationId: ORG_ID,
        title: "撤权竞态",
      }),
    );
    const exchange = expectExchange(
      await createMeetingAnswerExchange({
        createdBy: VIEWER_ID,
        meetingId: MEETING_ID,
        model: "gpt-5-mini",
        organizationId: ORG_ID,
        promptVersion: "meeting-answer-v1",
        provider: "openai",
        question: "谁负责支付迁移？",
        requestId: "00000000-0000-4000-8000-000000000085",
        threadId: thread.id,
      }),
    );
    await claimMeetingAnswerExchange({
      attempt: 1,
      exchangeId: exchange.id,
      executionToken: "revocation-race-token",
    });
    await db
      .delete(meetingAccessGrant)
      .where(
        and(
          eq(meetingAccessGrant.meetingId, MEETING_ID),
          eq(meetingAccessGrant.memberId, memberId),
        ),
      );

    await expect(
      loadMeetingAnswerContext({
        exchangeId: exchange.id,
        executionToken: "revocation-race-token",
      }),
    ).resolves.toBeNull();
  });

  it("rejects an exchange whose creator differs from its private thread owner", async () => {
    const thread = expectThread(
      await createMeetingQuestionThread({
        createdBy: OWNER_ID,
        meetingId: MEETING_ID,
        organizationId: ORG_ID,
        title: "Owner 私有线程",
      }),
    );

    await expect(
      db.insert(meetingQuestionExchange).values({
        createdBy: VIEWER_ID,
        id: `meeting_answer_invalid_creator_${SUFFIX}`,
        inputTranscriptRevisionId: TRANSCRIPT_ID,
        meetingId: MEETING_ID,
        model: "gpt-5-mini",
        organizationId: ORG_ID,
        promptVersion: "meeting-answer-v1",
        provider: "openai",
        question: "不属于该用户的内容",
        requestId: "00000000-0000-4000-8000-000000000086",
        sequence: 1,
        threadId: thread.id,
      }),
    ).rejects.toThrow();
  });

  it("enforces the database-backed per-user question rate limit", async () => {
    const thread = expectThread(
      await createMeetingQuestionThread({
        createdBy: OWNER_ID,
        meetingId: MEETING_ID,
        organizationId: ORG_ID,
        title: "限流",
      }),
    );
    const now = new Date();
    await db.insert(meetingQuestionExchange).values(
      Array.from({ length: 10 }, (_, index) => ({
        answer: {
          citations: [],
          kind: "insufficient-evidence" as const,
          text: MEETING_ANSWER_INSUFFICIENT_EVIDENCE_TEXT,
        },
        answeredAt: now,
        createdAt: now,
        createdBy: OWNER_ID,
        id: `meeting_answer_rate_${index}_${SUFFIX}`,
        inputTranscriptRevisionId: TRANSCRIPT_ID,
        meetingId: MEETING_ID,
        model: "gpt-5-mini",
        organizationId: ORG_ID,
        promptVersion: "meeting-answer-v1",
        provider: "openai",
        question: `历史问题 ${index}`,
        requestId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        sequence: index + 1,
        status: "ready" as const,
        threadId: thread.id,
      })),
    );

    await expect(
      createMeetingAnswerExchange({
        createdBy: OWNER_ID,
        meetingId: MEETING_ID,
        model: "gpt-5-mini",
        organizationId: ORG_ID,
        promptVersion: "meeting-answer-v1",
        provider: "openai",
        question: "第十一个问题",
        requestId: "00000000-0000-4000-8000-000000000087",
        threadId: thread.id,
      }),
    ).resolves.toBe("rate-limited");
  });
});
