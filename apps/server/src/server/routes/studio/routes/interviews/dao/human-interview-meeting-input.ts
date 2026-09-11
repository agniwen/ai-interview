import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../../../../../lib/server/db/index";
import { humanInterviewRound, humanInterviewRoundInterviewer, member } from "@app/db-schema/schema";
import { HumanInterviewMeetingError } from "./human-interview-meeting-access";

export async function loadHumanInterviewMeetingInterviewerIds(
  roundIds: string[],
): Promise<string[]> {
  const assignments = await db
    .select({ userId: humanInterviewRoundInterviewer.userId })
    .from(humanInterviewRoundInterviewer)
    .where(inArray(humanInterviewRoundInterviewer.roundId, roundIds));
  return [...new Set(assignments.map((assignment) => assignment.userId))];
}

export async function validateHumanInterviewMeetingInterviewerIds({
  interviewerIds,
  organizationId,
}: {
  interviewerIds: string[];
  organizationId: string;
}): Promise<string[]> {
  const uniqueInterviewerIds = [...new Set(interviewerIds)];
  if (uniqueInterviewerIds.length === 0) {
    throw new HumanInterviewMeetingError("请至少选择一位真人面试官。", 400);
  }
  const workspaceMembers = await db
    .select({ userId: member.userId })
    .from(member)
    .where(
      and(eq(member.organizationId, organizationId), inArray(member.userId, uniqueInterviewerIds)),
    );
  if (workspaceMembers.length !== uniqueInterviewerIds.length) {
    throw new HumanInterviewMeetingError("存在不属于当前工作区的真人面试官。", 404);
  }
  return uniqueInterviewerIds;
}

export async function validateHumanInterviewMeetingInput({
  organizationId,
  roundIds,
}: {
  organizationId: string;
  roundIds: string[];
}): Promise<string[]> {
  if (roundIds.length !== 1 || new Set(roundIds).size !== 1) {
    throw new HumanInterviewMeetingError("一场真人复面会议只能关联一个候选人轮次。", 400);
  }
  const rounds = await db
    .select({ id: humanInterviewRound.id, status: humanInterviewRound.status })
    .from(humanInterviewRound)
    .where(
      and(
        inArray(humanInterviewRound.id, roundIds),
        eq(humanInterviewRound.organizationId, organizationId),
      ),
    );
  if (rounds.length !== roundIds.length) {
    throw new HumanInterviewMeetingError("存在不属于当前组织的真人复面轮次。", 404);
  }
  if (rounds.some((round) => round.status !== "pending")) {
    throw new HumanInterviewMeetingError("只有待进行的真人复面轮次可以加入会议。", 400);
  }
  return loadHumanInterviewMeetingInterviewerIds(roundIds);
}
