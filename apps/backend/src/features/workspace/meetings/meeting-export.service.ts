/* oxlint-disable complexity, no-nested-ternary, typescript/consistent-type-imports, unicorn/no-nested-ternary -- Export source precedence is contractual; Nest needs MeetingCoreService at runtime. */
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { meetingAuditLog, meetingTranscriptTurn } from "@arc/db-schema/schema";
import {
  formatMeetingExportFooter,
  formatMeetingExportHeader,
  formatMeetingExportTurn,
} from "@arc/shared/meeting-export";
import type { MeetingAudioExportTrack, MeetingTextExportFormat } from "@arc/shared/meeting-export";
import {
  meetingIntelligencePayloadSchema,
  meetingIntelligenceTemplateSchema,
} from "@arc/shared/meeting-intelligence";
import { asc, eq } from "drizzle-orm";
import { WORKSPACE_DATABASE_PORT, WORKSPACE_OBJECT_STORAGE_PORT } from "../workspace.ports.js";
import type { WorkspaceDatabasePort, WorkspaceObjectStoragePort } from "../workspace.ports.js";
import { MeetingCoreService } from "./meeting-core.service.js";

function safeFilename(title: string) {
  return (
    title
      .normalize("NFKC")
      .replaceAll(/[\p{Cc}<>:"/\\|?*]+/gu, "-")
      .replaceAll(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "meeting"
  );
}

@Injectable()
export class MeetingExportService {
  constructor(
    @Inject(WORKSPACE_DATABASE_PORT) private readonly database: WorkspaceDatabasePort,
    @Inject(WORKSPACE_OBJECT_STORAGE_PORT) private readonly storage: WorkspaceObjectStoragePort,
    private readonly core: MeetingCoreService,
  ) {}

  async prepare(
    organizationId: string,
    userId: string,
    memberRole: string,
    meetingId: string,
    format: "audio" | MeetingTextExportFormat,
    audioTrack?: MeetingAudioExportTrack,
  ) {
    const authorized = await this.core.authorized(organizationId, userId, memberRole, meetingId);
    if (
      !authorized ||
      authorized.meeting.status === "trashed" ||
      authorized.meeting.status === "purging"
    ) {
      throw new NotFoundException("Meeting Session 不存在", { errorCode: "MEETING_NOT_FOUND" });
    }
    if (!(authorized.accessRole === "administrator" || authorized.accessRole === "owner")) {
      throw new ForbiddenException("无权导出该会议", { errorCode: "MEETING_EXPORT_FORBIDDEN" });
    }
    const { meeting } = authorized;
    await this.database.insert(meetingAuditLog).values({
      action: "meeting.export_requested",
      actorId: userId,
      detail: {
        format,
        intelligenceRevisionId: meeting.activeIntelligenceRevisionId,
        requestedTrack: format === "audio" ? (audioTrack ?? "automatic") : undefined,
        transcriptRevisionId: meeting.activeTranscriptRevisionId,
      },
      id: randomUUID(),
      meetingId,
      organizationId,
    });
    if (format === "audio") {
      const assets = await this.database.query.meetingRecordingAsset.findMany({
        where: {
          meetingId,
          status: "ready",
          track: { in: ["playback", "microphone", "system"] },
          verifiedAt: { isNotNull: true },
        },
      });
      const selected = audioTrack
        ? assets.find((asset) => asset.track === audioTrack)
        : ["playback", "system", "microphone"]
            .map((track) => assets.find((asset) => asset.track === track))
            .find(Boolean);
      if (!selected) {
        throw new ConflictException("会议导出资产尚未就绪", {
          errorCode: "MEETING_EXPORT_NOT_READY",
        });
      }
      const url = await this.storage.presignMeetingGet(selected.storageKey, 300);
      await this.database.insert(meetingAuditLog).values({
        action: "meeting.export_authorization_issued",
        actorId: userId,
        detail: { delivery: "short-lived-direct-object", format, track: selected.track },
        id: randomUUID(),
        meetingId,
        organizationId,
      });
      return { kind: "audio" as const, url };
    }
    if (!meeting.activeTranscriptRevisionId) {
      throw new ConflictException("会议导出资产尚未就绪", {
        errorCode: "MEETING_EXPORT_NOT_READY",
      });
    }
    const transcript = await this.database.query.meetingTranscriptRevision.findFirst({
      where: { id: meeting.activeTranscriptRevisionId, meetingId, organizationId },
    });
    if (!transcript) {
      throw new ConflictException("会议导出资产尚未就绪", {
        errorCode: "MEETING_EXPORT_NOT_READY",
      });
    }
    const intelligence = meeting.activeIntelligenceRevisionId
      ? await this.database.query.meetingIntelligenceRevision.findFirst({
          where: {
            id: meeting.activeIntelligenceRevisionId,
            meetingId,
            organizationId,
            transcriptRevisionId: transcript.id,
          },
        })
      : null;
    const snapshot = {
      intelligence: intelligence
        ? {
            content: meetingIntelligencePayloadSchema.parse(intelligence.content),
            createdAt: intelligence.createdAt.toISOString(),
            id: intelligence.id,
            revision: intelligence.revision,
            template: meetingIntelligenceTemplateSchema.parse(intelligence.templateKey),
            transcriptRevisionId: intelligence.transcriptRevisionId,
          }
        : null,
      meeting: {
        id: meeting.id,
        savedAt: meeting.savedAt.toISOString(),
        startedAt: meeting.startedAt.toISOString(),
        title: meeting.title,
      },
      transcript: {
        createdAt: transcript.createdAt.toISOString(),
        id: transcript.id,
        kind: transcript.kind === "human" ? ("human" as const) : ("final" as const),
        language: transcript.language,
        revision: transcript.revision,
      },
    };
    const turns = await this.database
      .select()
      .from(meetingTranscriptTurn)
      .where(eq(meetingTranscriptTurn.revisionId, transcript.id))
      .orderBy(asc(meetingTranscriptTurn.sequence));
    const pieces = [
      formatMeetingExportHeader(format, snapshot),
      ...turns.map((turn, index) =>
        formatMeetingExportTurn(
          format,
          {
            endMs: turn.endMs,
            id: turn.id,
            sequence: turn.sequence,
            speaker:
              turn.speakerDisplayName?.trim() ||
              (turn.track === "local" ? "本地说话人" : "远端说话人"),
            startMs: turn.startMs,
            text: turn.text,
            track: turn.track === "local" ? "local" : "remote",
          },
          index === 0,
        ),
      ),
      formatMeetingExportFooter(format),
    ];
    await this.database.insert(meetingAuditLog).values({
      action: "meeting.export_succeeded",
      actorId: userId,
      detail: {
        format,
        intelligenceRevisionId: intelligence?.id ?? null,
        transcriptRevisionId: transcript.id,
      },
      id: randomUUID(),
      meetingId,
      organizationId,
    });
    const metadata =
      format === "markdown"
        ? { contentType: "text/markdown; charset=utf-8", extension: "md" }
        : format === "txt"
          ? { contentType: "text/plain; charset=utf-8", extension: "txt" }
          : format === "srt"
            ? { contentType: "application/x-subrip; charset=utf-8", extension: "srt" }
            : { contentType: "application/json; charset=utf-8", extension: "json" };
    return {
      body: pieces.join(""),
      contentType: metadata.contentType,
      filename: `${safeFilename(meeting.title)}.${metadata.extension}`,
      kind: "text" as const,
    };
  }
}
