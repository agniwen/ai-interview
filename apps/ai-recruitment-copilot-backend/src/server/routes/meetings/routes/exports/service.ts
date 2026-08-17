import { presignRecordingGetObjectUrl } from "@arc/ai-recruitment-copilot-backend/lib/server/s3";
import { z } from "zod";
import {
  formatMeetingExportFooter,
  formatMeetingExportHeader,
  formatMeetingExportTurn,
} from "@arc/shared/meeting-export";
import type {
  MeetingAudioExportTrack,
  MeetingExportFormat,
  MeetingExportSnapshot,
  MeetingTextExportFormat,
} from "@arc/shared/meeting-export";
import type { JsonObject } from "@arc/db-schema/json";
import {
  meetingIntelligencePayloadSchema,
  meetingIntelligenceTemplateSchema,
} from "@arc/shared/meeting-intelligence";
import { recordMeetingAudit } from "../../dao";
import { loadMeetingExportContext, loadMeetingExportTurnsPage } from "./dao";

export interface MeetingExportDependencies {
  loadContext: typeof loadMeetingExportContext;
  loadTurnsPage: typeof loadMeetingExportTurnsPage;
  presign: typeof presignRecordingGetObjectUrl;
  recordAudit: typeof recordMeetingAudit;
}

const defaultDependencies: MeetingExportDependencies = {
  loadContext: loadMeetingExportContext,
  loadTurnsPage: loadMeetingExportTurnsPage,
  presign: presignRecordingGetObjectUrl,
  recordAudit: recordMeetingAudit,
};

const EXPORT_TURN_PAGE_SIZE = 500;
const meetingTranscriptKindSchema = z.enum(["final", "human"]);
const meetingTranscriptTurnTrackSchema = z.enum(["local", "remote"]);
const recordingTrackPriority = [
  "playback",
  "system",
  "microphone",
] satisfies readonly MeetingAudioExportTrack[];

class MeetingExportAuthorizationRevokedError extends Error {
  constructor() {
    super("Meeting export authorization revoked");
    this.name = "MeetingExportAuthorizationRevokedError";
  }
}

function logAuditFailure(error: Error): void {
  console.error("[meeting-export] audit write failed", {
    errorName: error.name,
  });
}

export type PreparedMeetingExport =
  | { kind: "not-found" | "forbidden" | "not-ready" | "failed" }
  | { kind: "audio"; url: string }
  | {
      body: ReadableStream<Uint8Array>;
      contentType: string;
      filename: string;
      kind: "text";
    };

interface MeetingExportAuditDetail extends JsonObject {
  code?: string;
  format: MeetingExportFormat;
  intelligenceRevisionId: string | null;
  requestedTrack?: MeetingAudioExportTrack | "automatic";
  transcriptRevisionId: string | null;
}

function safeFilename(title: string): string {
  return (
    title
      .normalize("NFKC")
      .replaceAll(/[\p{Cc}<>:"/\\|?*]+/gu, "-")
      .replaceAll(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "meeting"
  );
}

function textExportMetadata(format: MeetingTextExportFormat) {
  switch (format) {
    case "markdown": {
      return { contentType: "text/markdown; charset=utf-8", extension: "md" };
    }
    case "txt": {
      return { contentType: "text/plain; charset=utf-8", extension: "txt" };
    }
    case "srt": {
      return { contentType: "application/x-subrip; charset=utf-8", extension: "srt" };
    }
    case "json": {
      return { contentType: "application/json; charset=utf-8", extension: "json" };
    }
    default: {
      throw new Error(`Unsupported Meeting export format: ${format satisfies never}`);
    }
  }
}

function createAuditedStream(
  input: {
    activeIntelligenceRevisionId: string | null;
    actorId: string;
    format: MeetingTextExportFormat;
    meetingId: string;
    organizationId: string;
    snapshot: MeetingExportSnapshot;
  },
  dependencies: MeetingExportDependencies,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  async function* chunks() {
    let afterSequence = -1;
    let first = true;
    let headerSent = false;
    while (true) {
      const turns = await dependencies.loadTurnsPage({
        afterSequence,
        expectedIntelligenceRevisionId: input.activeIntelligenceRevisionId,
        limit: EXPORT_TURN_PAGE_SIZE,
        meetingId: input.meetingId,
        organizationId: input.organizationId,
        revisionId: input.snapshot.transcript.id,
        userId: input.actorId,
      });
      if (turns.kind === "revoked") {
        throw new MeetingExportAuthorizationRevokedError();
      }
      if (!headerSent) {
        yield formatMeetingExportHeader(input.format, input.snapshot);
        headerSent = true;
      }
      for (const turn of turns.turns) {
        yield formatMeetingExportTurn(
          input.format,
          {
            endMs: turn.endMs,
            id: turn.id,
            sequence: turn.sequence,
            speaker:
              turn.speakerDisplayName?.trim() ||
              (turn.track === "local" ? "本地说话人" : "远端说话人"),
            startMs: turn.startMs,
            text: turn.text,
            track: meetingTranscriptTurnTrackSchema.parse(turn.track),
          },
          first,
        );
        first = false;
        afterSequence = turn.sequence;
      }
      if (turns.turns.length < EXPORT_TURN_PAGE_SIZE) {
        break;
      }
    }
    yield formatMeetingExportFooter(input.format);
  }
  const iterator = chunks();
  let finalized = false;
  let finalizing = false;
  const audit = async (
    action: "meeting.export_succeeded" | "meeting.export_failed",
    code?: string,
  ) => {
    if (finalized || finalizing) {
      return;
    }
    finalizing = true;
    try {
      const detail: MeetingExportAuditDetail = {
        format: input.format,
        intelligenceRevisionId: input.snapshot.intelligence?.id ?? null,
        transcriptRevisionId: input.snapshot.transcript.id,
      };
      if (code) {
        detail.code = code;
      }
      await dependencies.recordAudit({
        action,
        actorId: input.actorId,
        detail,
        meetingId: input.meetingId,
        organizationId: input.organizationId,
      });
      finalized = true;
    } finally {
      finalizing = false;
    }
  };
  return new ReadableStream<Uint8Array>({
    async cancel() {
      try {
        await iterator.return?.();
      } finally {
        await audit("meeting.export_failed", "cancelled").catch((error) =>
          logAuditFailure(
            error instanceof Error ? error : new Error("Meeting export audit failed"),
          ),
        );
      }
    },
    async pull(controller) {
      try {
        const chunk = await iterator.next();
        if (chunk.done) {
          await audit("meeting.export_succeeded");
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(chunk.value));
      } catch (error) {
        await audit(
          "meeting.export_failed",
          error instanceof MeetingExportAuthorizationRevokedError
            ? "authorization-revoked"
            : "stream-failed",
        ).catch((auditError) =>
          logAuditFailure(
            auditError instanceof Error ? auditError : new Error("Meeting export audit failed"),
          ),
        );
        controller.error(error);
      }
    },
  });
}

export async function prepareMeetingExport(
  input: {
    audioTrack?: MeetingAudioExportTrack;
    format: MeetingExportFormat;
    meetingId: string;
    organizationId: string;
    userId: string;
  },
  dependencies: MeetingExportDependencies = defaultDependencies,
): Promise<PreparedMeetingExport> {
  const context = await dependencies.loadContext(input);
  if (context.kind !== "authorized") {
    await dependencies.recordAudit({
      action: "meeting.export_denied",
      actorId: input.userId,
      detail: { code: context.kind, format: input.format },
      organizationId: input.organizationId,
    });
    return context;
  }
  const baseDetail: MeetingExportAuditDetail = {
    format: input.format,
    intelligenceRevisionId: context.intelligence?.id ?? null,
    transcriptRevisionId: context.transcript?.id ?? null,
  };
  if (input.format === "audio") {
    baseDetail.requestedTrack = input.audioTrack ?? "automatic";
  }
  await dependencies.recordAudit({
    action: "meeting.export_requested",
    actorId: input.userId,
    detail: baseDetail,
    meetingId: input.meetingId,
    organizationId: input.organizationId,
  });
  if (input.format === "audio") {
    const selectedAsset = input.audioTrack
      ? context.recordingAssets.find((asset) => asset.track === input.audioTrack)
      : recordingTrackPriority
          .map((track) => context.recordingAssets.find((asset) => asset.track === track))
          .find(Boolean);
    if (!selectedAsset) {
      await dependencies.recordAudit({
        action: "meeting.export_failed",
        actorId: input.userId,
        detail: { code: "recording-not-ready", ...baseDetail },
        meetingId: input.meetingId,
        organizationId: input.organizationId,
      });
      return { kind: "not-ready" };
    }
    try {
      const url = await dependencies.presign(
        selectedAsset.storageKey,
        300,
        `${safeFilename(context.meeting.title)}-${selectedAsset.track}.webm`,
      );
      await dependencies.recordAudit({
        action: "meeting.export_authorization_issued",
        actorId: input.userId,
        detail: {
          ...baseDetail,
          delivery: "short-lived-direct-object",
          track: selectedAsset.track,
        },
        meetingId: input.meetingId,
        organizationId: input.organizationId,
      });
      return { kind: "audio", url };
    } catch {
      await dependencies.recordAudit({
        action: "meeting.export_failed",
        actorId: input.userId,
        detail: { code: "authorization-failed", ...baseDetail },
        meetingId: input.meetingId,
        organizationId: input.organizationId,
      });
      return { kind: "failed" };
    }
  }
  if (!context.transcript) {
    await dependencies.recordAudit({
      action: "meeting.export_failed",
      actorId: input.userId,
      detail: { code: "transcript-not-ready", ...baseDetail },
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    });
    return { kind: "not-ready" };
  }
  let intelligence: MeetingExportSnapshot["intelligence"] = null;
  try {
    intelligence = context.intelligence
      ? {
          content: meetingIntelligencePayloadSchema.parse(context.intelligence.content),
          createdAt: context.intelligence.createdAt.toISOString(),
          id: context.intelligence.id,
          revision: context.intelligence.revision,
          template: meetingIntelligenceTemplateSchema.parse(context.intelligence.templateKey),
          transcriptRevisionId: context.intelligence.transcriptRevisionId,
        }
      : null;
  } catch {
    await dependencies.recordAudit({
      action: "meeting.export_failed",
      actorId: input.userId,
      detail: { code: "snapshot-invalid", ...baseDetail },
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    });
    return { kind: "failed" };
  }
  const snapshot: MeetingExportSnapshot = {
    intelligence,
    meeting: {
      id: context.meeting.id,
      savedAt: context.meeting.savedAt.toISOString(),
      startedAt: context.meeting.startedAt.toISOString(),
      title: context.meeting.title,
    },
    transcript: {
      createdAt: context.transcript.createdAt.toISOString(),
      id: context.transcript.id,
      kind: meetingTranscriptKindSchema.parse(context.transcript.kind),
      language: context.transcript.language,
      revision: context.transcript.revision,
    },
  };
  const metadata = textExportMetadata(input.format);
  return {
    body: createAuditedStream(
      {
        activeIntelligenceRevisionId: context.activeIntelligenceRevisionId,
        actorId: input.userId,
        format: input.format,
        meetingId: input.meetingId,
        organizationId: input.organizationId,
        snapshot,
      },
      dependencies,
    ),
    contentType: metadata.contentType,
    filename: `${safeFilename(context.meeting.title)}.${metadata.extension}`,
    kind: "text",
  };
}
