import { meetingLiveSummarySnapshotSchema } from "@app/shared/meeting-live-summary";
import { meetingLiveTranscriptDraftSchema } from "@app/shared/meeting-transcription";
import { meetingIntelligencePayloadSchema } from "@app/shared/meeting-intelligence";
import { extendSummaryFingerprint } from "@app/shared/meeting-summary-fingerprint";
import { canonicalizeDeepgramLiveTranscriptDraft } from "./deepgram-live-transcript";

function sameTurn(
  source: {
    text: string;
    startMs: number;
    endMs: number;
    speakerKey: string;
    speakerDisplayName?: string | null;
  },
  target: {
    text: string;
    startMs: number;
    endMs: number;
    speakerKey: string;
    speakerDisplayName: string | null;
  },
) {
  return (
    source.text === target.text &&
    source.startMs === target.startMs &&
    source.endMs === target.endMs &&
    source.speakerKey === target.speakerKey &&
    (source.speakerDisplayName ?? null) === target.speakerDisplayName
  );
}

/** Reuse only a complete, unchanged prefix; any correction falls back to canonical analysis. */
export async function reusableLiveSummaryPrefix(input: {
  snapshot: unknown;
  draft: unknown;
  startedAt: Date;
  turns: {
    id: string;
    text: string;
    startMs: number;
    endMs: number;
    speakerKey: string;
    speakerDisplayName: string | null;
  }[];
}) {
  const snapshot = meetingLiveSummarySnapshotSchema.safeParse(input.snapshot).data;
  const draft = meetingLiveTranscriptDraftSchema.safeParse(input.draft).data;
  if (!snapshot?.sourceFingerprint || !draft) {
    return;
  }
  const { count, digest } = snapshot.sourceFingerprint;
  const canonical = canonicalizeDeepgramLiveTranscriptDraft(draft, input.startedAt).turns.slice(
    0,
    count,
  );
  if (canonical.length !== count || input.turns.length < count) {
    return;
  }
  const aliases = new Map<string, string>();
  for (const [index, source] of canonical.entries()) {
    const target = input.turns[index];
    if (!target || !sameTurn(source, target) || !source.attribution?.sourceId) {
      return;
    }
    aliases.set(source.attribution?.sourceId, target.id);
  }
  const fingerprint = await extendSummaryFingerprint(
    undefined,
    canonical.map((turn) => ({ ...turn, id: turn.attribution?.sourceId ?? "" })),
  );
  if (fingerprint.digest !== digest) {
    return;
  }
  const evidence = (ids: string[]) => ids.map((id) => aliases.get(id) ?? "");
  const content = meetingIntelligencePayloadSchema.safeParse({
    actionItems: [],
    decisions: [],
    openQuestions: [
      ...snapshot.topics.flatMap((topic) =>
        topic.points
          .filter((point) => point.kind === "question")
          .map((point) => ({
            evidenceTurnIds: evidence(point.evidenceTurnIds),
            question: point.text,
          })),
      ),
      ...(snapshot.pendingThoughts ?? []).map((thought) => ({
        evidenceTurnIds: evidence(thought.evidenceTurnIds),
        question: thought.text,
      })),
    ],
    summary: snapshot.summary,
    template: "general",
    topics: snapshot.topics.map((topic) => ({
      evidenceTurnIds: evidence(topic.evidenceTurnIds).slice(0, 50),
      summary: [
        topic.summary,
        ...topic.points.filter((point) => point.kind === "fact").map((point) => point.text),
      ].join("\n"),
      title: topic.title,
    })),
  });
  if (!content.success) {
    return;
  }
  if (snapshot.template === "recruiting-interview" && content.data.template === "general") {
    const recruiting = meetingIntelligencePayloadSchema.safeParse({
      candidateStatements: content.data.topics.map((topic) => ({
        attribution: "unknown",
        evidenceTurnIds: topic.evidenceTurnIds,
        statement: topic.summary,
        verification: "stated",
      })),
      followUpActions: [],
      keyExperience: [],
      summary: content.data.summary,
      template: "recruiting-interview",
      verificationItems: content.data.openQuestions.map((question) => ({
        evidenceTurnIds: question.evidenceTurnIds,
        statement: question.question,
      })),
    });
    return recruiting.success ? { content: recruiting.data, turnCount: count } : undefined;
  }
  return { content: content.data, turnCount: count };
}
