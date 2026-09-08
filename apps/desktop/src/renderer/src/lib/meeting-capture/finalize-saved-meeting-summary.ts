import { selectSummarySegment, summarySegmentContext } from "@app/shared/meeting-summary-segments";
import {
  MEETING_LIVE_SUMMARY_REQUEST_TIMEOUT_MS,
  meetingLiveSummaryRequestSchema,
  meetingLiveSummarySnapshotSchema,
  MeetingSummaryPendingError,
} from "@app/shared/meeting-live-summary";
import type {
  MeetingLiveSummaryCheckpoint,
  MeetingLiveSummarySnapshot,
  MeetingLiveSummaryTemplate,
} from "@app/shared/meeting-live-summary";
import type { MeetingLiveTranscriptDraft } from "@app/shared/meeting-transcription";
import { requestMeetingLiveSummary } from "@/lib/client/meetings";
import {
  buildMeetingLiveSummaryTurns,
  meetingLiveSummaryTurnFingerprint,
} from "./live-summary-controller";
import type { MeetingLiveSummaryProvider } from "./live-summary-controller";

interface SavedSummarySource {
  captureId: string;
  checkpoint?: MeetingLiveSummaryCheckpoint | null;
  draft: MeetingLiveTranscriptDraft | null;
  startedAt: string;
  summary: MeetingLiveSummarySnapshot | null;
  template: MeetingLiveSummaryTemplate;
}

interface FinalizeSummaryDependencies {
  persist: (
    summary: MeetingLiveSummarySnapshot,
    checkpoint: MeetingLiveSummaryCheckpoint,
  ) => Promise<void>;
  provider: MeetingLiveSummaryProvider;
  timeoutMs?: number;
}

/** Runs on frozen, durable input; live recording resets and new captures cannot cancel it. */
export async function finalizeSavedMeetingSummary(
  source: SavedSummarySource,
  dependencies: FinalizeSummaryDependencies,
): Promise<MeetingLiveSummarySnapshot | null> {
  if (!source.draft) {
    return source.summary;
  }
  const turns = buildMeetingLiveSummaryTurns(source.draft, source.startedAt);
  let { summary } = source;
  const confirmed = new Map(
    source.checkpoint?.revision === summary?.revision
      ? Object.entries(source.checkpoint?.turns ?? {})
      : [],
  );
  // Timestamp coverage is insufficient: finalization can correct an earlier turn.
  let pending = turns.filter(
    (turn) => confirmed.get(turn.id) !== meetingLiveSummaryTurnFingerprint(turn),
  );
  try {
    while (pending.length) {
      const batch = selectSummarySegment(pending);
      const request = meetingLiveSummaryRequestSchema.parse({
        baseSnapshot: summary,
        captureId: source.captureId,
        contextTurns: summarySegmentContext(turns, batch),
        template: source.template,
        turns: batch,
      });
      const signal = AbortSignal.timeout(
        dependencies.timeoutMs ?? MEETING_LIVE_SUMMARY_REQUEST_TIMEOUT_MS,
      );
      const result = meetingLiveSummarySnapshotSchema.parse(
        await dependencies.provider.summarize(request, signal),
      );
      if (
        result.captureId !== source.captureId ||
        result.revision !== (summary?.revision ?? 0) + 1 ||
        result.template !== source.template
      ) {
        throw new Error("结束总结返回了无效版本");
      }
      for (const turn of batch) {
        confirmed.set(turn.id, meetingLiveSummaryTurnFingerprint(turn));
      }
      // Commit summary + progress atomically so retries never skip unpersisted work.
      await dependencies.persist(result, {
        revision: result.revision,
        turns: Object.fromEntries(confirmed),
      });
      summary = result;
      pending = pending.slice(batch.length);
    }
    return summary;
  } catch (error) {
    let message = error instanceof Error ? error.message : "AI 暂时不可用";
    if (error instanceof Error && error.name === "TimeoutError") {
      message = "生成总结超时，已保留补齐进度，请稍后重试";
    }
    throw new MeetingSummaryPendingError(`录音已保存，总结待补齐：${message}`, { cause: error });
  }
}

/** Completes local metadata before creating the workspace upload plan. */
export async function finalizeWorkspaceRecordingSummary(captureId: string, workspaceSlug: string) {
  const api = window.api.meetingCapture;
  const sessions = await api.listLocalSessions();
  const session = sessions.find((item) => item.id === captureId);
  if (!session) {
    throw new MeetingSummaryPendingError("本地录音记录不存在，无法补齐总结");
  }
  return finalizeSavedMeetingSummary(
    {
      captureId,
      checkpoint: session.liveSummaryCheckpoint,
      draft: session.liveTranscriptDraft,
      startedAt: session.startedAt,
      summary: session.liveSummary ?? null,
      template:
        session.liveSummary?.template ??
        (session.recruitingRecordId ? "recruiting-interview" : "general"),
    },
    {
      persist: async (liveSummary, liveSummaryCheckpoint) => {
        await api.updateLocalSession(captureId, { liveSummary, liveSummaryCheckpoint });
      },
      provider: {
        summarize: (request, signal) => requestMeetingLiveSummary(workspaceSlug, request, signal),
      },
    },
  );
}
