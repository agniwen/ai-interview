import { and, asc, eq } from "drizzle-orm";
import { meetingSession, meetingTranscriptTurn, member } from "@app/db-schema/schema";
import type { Database } from "@app/database";
import { echoTranscriptSchema } from "@app/shared/meeting-device-processing";
import { meetingIntelligencePayloadSchema } from "@app/shared/meeting-intelligence";
import { EchoProcessingError } from "./error";

export interface EchoContextInput {
  meetingId: string;
  organizationId: string;
  userId: string;
}

export function createEchoContextDao(db: Database) {
  return {
    adopt: (input: EchoContextInput & { deviceId: string; epoch: number; regenerate?: boolean }) =>
      db.transaction(async (tx) => {
        const [meeting] = await tx
          .select()
          .from(meetingSession)
          .where(
            and(
              eq(meetingSession.id, input.meetingId),
              eq(meetingSession.organizationId, input.organizationId),
            ),
          )
          .for("update")
          .limit(1);
        const [membership] = await tx
          .select({ role: member.role })
          .from(member)
          .where(
            and(eq(member.organizationId, input.organizationId), eq(member.userId, input.userId)),
          )
          .for("share")
          .limit(1);
        if (!meeting) {
          throw new EchoProcessingError(404, "Meeting Session 不存在");
        }
        if (
          !membership ||
          !(
            (meeting.custodianId ?? meeting.ownerId) === input.userId ||
            ["owner", "admin"].includes(membership.role)
          )
        ) {
          throw new EchoProcessingError(403, "无权接手此录音");
        }
        if (
          meeting.processingOwner !== "device" ||
          meeting.status === "purging" ||
          meeting.status === "trashed"
        ) {
          throw new EchoProcessingError(409, "录音状态已变化");
        }
        if (
          meeting.processingDeviceId === input.deviceId &&
          meeting.processingAccountId === input.userId &&
          meeting.processingEpoch === input.epoch + 1
        ) {
          return { epoch: meeting.processingEpoch };
        }
        if (meeting.processingEpoch !== input.epoch) {
          throw new EchoProcessingError(409, "录音状态已变化");
        }
        const complete =
          meeting.status === "ready" &&
          meeting.transcriptionStatus === "ready" &&
          meeting.intelligenceStatus === "ready";
        if (meeting.processingDeviceId && !(input.regenerate && complete)) {
          if (
            meeting.processingDeviceId === input.deviceId &&
            meeting.processingAccountId === input.userId
          ) {
            return { epoch: meeting.processingEpoch };
          }
          throw new EchoProcessingError(409, "此录音仍由原设备处理");
        }
        const epoch = meeting.processingEpoch + 1;
        await tx
          .update(meetingSession)
          .set({
            intelligenceRunId: null,
            processingAccountId: input.userId,
            processingDeviceId: input.deviceId,
            processingEpoch: epoch,
            processingRunId: null,
            transcriptionRunId: null,
          })
          .where(eq(meetingSession.id, input.meetingId));
        return { epoch };
      }),
    load: async (input: EchoContextInput) => {
      const meeting = await db.query.meetingSession.findFirst({
        where: { id: input.meetingId, organizationId: input.organizationId },
        with: { assets: true },
      });
      if (!meeting) {
        throw new EchoProcessingError(404, "Meeting Session 不存在");
      }
      const membership = await db.query.member.findFirst({
        columns: { role: true },
        where: { organizationId: input.organizationId, userId: input.userId },
      });
      if (
        !membership ||
        !(
          (meeting.custodianId ?? meeting.ownerId) === input.userId ||
          membership.role === "owner" ||
          membership.role === "admin"
        )
      ) {
        throw new EchoProcessingError(403, "无权处理此录音");
      }
      if (meeting.status === "purging" || meeting.status === "trashed") {
        throw new EchoProcessingError(410, "录音已归档或正在永久删除");
      }
      const [revision, intelligence] = await Promise.all([
        meeting.activeTranscriptRevisionId
          ? db.query.meetingTranscriptRevision.findFirst({
              where: { id: meeting.activeTranscriptRevisionId },
            })
          : undefined,
        meeting.activeIntelligenceRevisionId
          ? db.query.meetingIntelligenceRevision.findFirst({
              where: { id: meeting.activeIntelligenceRevisionId },
            })
          : undefined,
      ]);
      const turns = revision
        ? await db
            .select()
            .from(meetingTranscriptTurn)
            .where(eq(meetingTranscriptTurn.revisionId, revision.id))
            .orderBy(asc(meetingTranscriptTurn.sequence))
        : [];
      const linked = await db.query.recruitingMeetingContext.findFirst({
        columns: { meetingId: true },
        where: { meetingId: input.meetingId, organizationId: input.organizationId },
      });
      return {
        intelligence: intelligence
          ? meetingIntelligencePayloadSchema.parse(intelligence.content)
          : null,
        meeting,
        suggestedTemplate: linked ? ("recruiting-interview" as const) : ("general" as const),
        transcript: revision
          ? echoTranscriptSchema.parse({ ...revision, revisionId: revision.id, turns })
          : null,
      };
    },
  };
}
