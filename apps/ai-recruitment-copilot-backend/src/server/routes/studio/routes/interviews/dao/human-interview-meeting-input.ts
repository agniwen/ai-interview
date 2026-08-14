import { and, eq, inArray } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { member, studioHumanInterviewRound } from "@arc/db-schema/schema";
import { HumanInterviewMeetingError } from "./human-interview-meeting-access";

export async function validateHumanInterviewMeetingInput({
  interviewerIds,
  organizationId,
  roundIds,
}: {
  interviewerIds: string[];
  organizationId: string;
  roundIds: string[];
}) {
  const [interviewerMembers, rounds] = await Promise.all([
    db
      .select({ userId: member.userId })
      .from(member)
      .where(
        and(eq(member.organizationId, organizationId), inArray(member.userId, interviewerIds)),
      ),
    db
      .select({ id: studioHumanInterviewRound.id, status: studioHumanInterviewRound.status })
      .from(studioHumanInterviewRound)
      .where(
        and(
          inArray(studioHumanInterviewRound.id, roundIds),
          eq(studioHumanInterviewRound.organizationId, organizationId),
        ),
      ),
  ]);
  if (interviewerMembers.length !== interviewerIds.length) {
    throw new HumanInterviewMeetingError("存在不属于当前工作区的真人面试官。", 404);
  }
  if (rounds.length !== roundIds.length) {
    throw new HumanInterviewMeetingError("存在不属于当前组织的真人复面轮次。", 404);
  }
  if (rounds.some((round) => round.status !== "pending")) {
    throw new HumanInterviewMeetingError("只有待进行的真人复面轮次可以加入会议。", 400);
  }
}
