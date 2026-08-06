import { and, eq, inArray } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  studioHumanInterviewMeeting,
  studioHumanInterviewMeetingRound,
  studioHumanInterviewRound,
} from "@arc/db-schema/schema";
import type { HumanInterviewMeetingScheduleUpdate } from "@arc/db-schema/studio-interviews";
import type { HumanInterviewMeetingRecord } from "@arc/shared/studio-pipeline-stages";
import {
  HumanInterviewMeetingError,
  resolveValidUntilInput,
} from "./human-interview-meeting-access";
import { loadHumanInterviewMeetingById } from "./human-interview-meetings";

export async function updateHumanInterviewMeetingSchedule({
  input,
  meetingId,
  organizationId,
}: {
  input: HumanInterviewMeetingScheduleUpdate;
  meetingId: string;
  organizationId: string;
}): Promise<HumanInterviewMeetingRecord> {
  const scheduledAt = new Date(input.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new HumanInterviewMeetingError("请输入有效的面试时间。", 400);
  }

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(studioHumanInterviewMeeting)
      .where(
        and(
          eq(studioHumanInterviewMeeting.id, meetingId),
          eq(studioHumanInterviewMeeting.organizationId, organizationId),
        ),
      )
      .for("update")
      .limit(1);
    if (!existing) {
      throw new HumanInterviewMeetingError("真人复面会议不存在。", 404);
    }
    if (existing.status !== "scheduled") {
      throw new HumanInterviewMeetingError("已开始、已结束或已取消的会议不能调整时间。", 400);
    }
    if (existing.feishuProviderId && existing.feishuSyncStatus === "pending") {
      throw new HumanInterviewMeetingError("飞书会议尚未同步完成，请先完成同步再调整时间。", 400);
    }
    if (existing.feishuSyncStatus === "creating") {
      throw new HumanInterviewMeetingError("飞书会议正在同步，请稍后再调整时间。", 400);
    }
    if (existing.feishuSyncStatus === "unknown") {
      throw new HumanInterviewMeetingError(
        "飞书会议创建结果未知，请先在飞书中核查后再调整时间。",
        400,
      );
    }

    const validUntil = resolveValidUntilInput({
      existingValidUntil: existing.validUntil,
      scheduledAt,
      validUntil: input.validUntil,
    });
    const now = new Date();
    const roundLinks = await tx
      .select({ roundId: studioHumanInterviewMeetingRound.roundId })
      .from(studioHumanInterviewMeetingRound)
      .where(eq(studioHumanInterviewMeetingRound.meetingId, meetingId));

    await tx
      .update(studioHumanInterviewMeeting)
      .set({
        feishuLastError: null,
        feishuSyncStatus: existing.feishuProviderId ? "pending" : null,
        scheduledAt,
        updatedAt: now,
        validUntil,
      })
      .where(eq(studioHumanInterviewMeeting.id, meetingId));
    if (roundLinks.length > 0) {
      await tx
        .update(studioHumanInterviewRound)
        .set({ scheduledAt, updatedAt: now })
        .where(
          inArray(
            studioHumanInterviewRound.id,
            roundLinks.map((round) => round.roundId),
          ),
        );
    }
  });

  const updated = await loadHumanInterviewMeetingById(meetingId, organizationId);
  if (!updated) {
    throw new Error("更新真人复面会议后查询失败");
  }
  return updated;
}
