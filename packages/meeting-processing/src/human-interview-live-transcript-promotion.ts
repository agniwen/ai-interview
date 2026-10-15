import { createHash } from "node:crypto";
import { eq, max } from "drizzle-orm";
import {
  meetingSession,
  meetingTranscriptRevision,
  meetingTranscriptTurn,
} from "@app/db-schema/schema";
import type { Database } from "@app/database";
import type { MeetingLiveTranscriptDraftRecord } from "@app/db-schema/meeting-live-transcript";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface LiveTranscriptInterviewer {
  liveTranscriptDraft: MeetingLiveTranscriptDraftRecord | null;
  name: string;
  role: string;
  userId: string;
}

export interface LiveTranscriptSource {
  draft: MeetingLiveTranscriptDraftRecord;
  owner: LiveTranscriptInterviewer;
}

function hasFinalTurns(interviewer: LiveTranscriptInterviewer): boolean {
  return interviewer.liveTranscriptDraft?.turns.some((turn) => turn.final) ?? false;
}

/** 正式转录来源：优先操作人，其次主持人，再其次任意留下定稿字幕的面试官。 */
export function selectLiveTranscriptSource(
  interviewers: LiveTranscriptInterviewer[],
  preferredUserId: string | null,
): LiveTranscriptSource | null {
  const owner =
    interviewers.find(
      (interviewer) => interviewer.userId === preferredUserId && hasFinalTurns(interviewer),
    ) ??
    interviewers.find((interviewer) => interviewer.role === "host" && hasFinalTurns(interviewer)) ??
    interviewers.find(hasFinalTurns);
  return owner?.liveTranscriptDraft ? { draft: owner.liveTranscriptDraft, owner } : null;
}

/** 浏览器字幕只区分本地麦克风与远端混音：麦克风归属草稿所有人，远端归属候选人。 */
export function buildLiveTranscriptTurns(input: {
  candidateName: string;
  roundId: string;
  source: LiveTranscriptSource;
}) {
  return input.source.draft.turns
    .filter((turn) => turn.final)
    .map((turn, sequence) => {
      const startMs = turn.startMs ?? sequence * 1000;
      const endMs = Math.max(startMs + 1, turn.endMs ?? startMs + 1000);
      const candidate = turn.track === "system";
      return {
        confidence: null,
        endMs,
        sequence,
        speakerDisplayName: candidate ? input.candidateName : input.source.owner.name,
        speakerKey: candidate
          ? `candidate:${input.roundId}`
          : `interviewer:${input.source.owner.userId}`,
        startMs,
        text: turn.text,
        track: candidate ? "remote" : "local",
      };
    });
}

export function liveTranscriptManifestSha256(draft: MeetingLiveTranscriptDraftRecord): string {
  return createHash("sha256").update(JSON.stringify(draft)).digest("hex");
}

/** 把字幕草稿发布为会议正式转录，录音不再进入离线转写。 */
export async function publishLiveTranscriptRevisionTx(
  tx: Transaction,
  input: {
    actorId: string;
    candidateName: string;
    meetingSessionId: string;
    organizationId: string;
    roundId: string;
    source: LiveTranscriptSource;
  },
): Promise<string> {
  const transcriptRevisionId = crypto.randomUUID();
  const [latest] = await tx
    .select({ revision: max(meetingTranscriptRevision.revision) })
    .from(meetingTranscriptRevision)
    .where(eq(meetingTranscriptRevision.meetingId, input.meetingSessionId));
  await tx.insert(meetingTranscriptRevision).values({
    basedOnRevisionId: null,
    createdBy: input.actorId,
    id: transcriptRevisionId,
    kind: "human",
    language: "zh-CN",
    meetingId: input.meetingSessionId,
    model: "qwen-realtime-reviewed",
    organizationId: input.organizationId,
    pipelineVersion: "human-live-transcript-recovery-v1",
    processingRunId: null,
    provider: "qwen",
    region: "cn-beijing",
    revision: Number(latest?.revision ?? 0) + 1,
    sourceManifestSha256: liveTranscriptManifestSha256(input.source.draft),
  });
  await tx.insert(meetingTranscriptTurn).values(
    buildLiveTranscriptTurns(input).map((turn) => ({
      ...turn,
      id: crypto.randomUUID(),
      revisionId: transcriptRevisionId,
    })),
  );
  await tx
    .update(meetingSession)
    .set({
      activeTranscriptRevisionId: transcriptRevisionId,
      transcriptionError: null,
      transcriptionStatus: "ready",
    })
    .where(eq(meetingSession.id, input.meetingSessionId));
  return transcriptRevisionId;
}
