import { and, eq } from "drizzle-orm";
import { meetingSession, member, meetingAccessGrant } from "@app/db-schema/schema";
import type { Database } from "@app/database";
import { EchoProcessingError } from "./error";

export interface EchoProcessingActor {
  access?: "question";
  meetingId: string;
  organizationId: string;
  userId: string;
  deviceId: string;
  epoch: number;
}
export type EchoTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function lockEchoDeviceMeeting(tx: EchoTransaction, input: EchoProcessingActor) {
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
  if (!meeting) {
    throw new EchoProcessingError(404, "Meeting Session 不存在");
  }
  const [membership] = await tx
    .select({ id: member.id, role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, input.organizationId), eq(member.userId, input.userId)))
    .for("share")
    .limit(1);
  const [grant] =
    membership && input.access === "question"
      ? await tx
          .select({ role: meetingAccessGrant.role })
          .from(meetingAccessGrant)
          .where(
            and(
              eq(meetingAccessGrant.meetingId, input.meetingId),
              eq(meetingAccessGrant.memberId, membership.id),
            ),
          )
          .for("share")
          .limit(1)
      : [];
  const canRead = input.access === "question" && (meeting.visibility === "workspace" || grant);
  if (
    !membership ||
    !(
      canRead ||
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
  if (meeting.processingOwner !== "device" || meeting.processingEpoch !== input.epoch) {
    throw new EchoProcessingError(409, "处理版本已变化，请刷新录音状态");
  }
  if (
    input.access !== "question" &&
    (meeting.processingDeviceId !== input.deviceId || meeting.processingAccountId !== input.userId)
  ) {
    throw new EchoProcessingError(409, "此录音正在等待原处理设备继续处理");
  }
  return meeting;
}

export function assertEchoDeviceOwnership(db: Database, input: EchoProcessingActor) {
  return db.transaction((tx) => lockEchoDeviceMeeting(tx, input));
}
