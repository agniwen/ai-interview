import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../../../../../lib/server/db/index";
import {
  studioHumanInterviewRound,
  studioHumanInterviewRoundInterviewer,
} from "@arc/db-schema/schema";
import { HumanInterviewMeetingError } from "./human-interview-meeting-access";

export async function loadHumanInterviewMeetingInterviewerIds(
  roundIds: string[],
): Promise<string[]> {
  const assignments = await db
    .select({ userId: studioHumanInterviewRoundInterviewer.userId })
    .from(studioHumanInterviewRoundInterviewer)
    .where(inArray(studioHumanInterviewRoundInterviewer.roundId, roundIds));
  return [...new Set(assignments.map((assignment) => assignment.userId))];
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
    .select({ id: studioHumanInterviewRound.id, status: studioHumanInterviewRound.status })
    .from(studioHumanInterviewRound)
    .where(
      and(
        inArray(studioHumanInterviewRound.id, roundIds),
        eq(studioHumanInterviewRound.organizationId, organizationId),
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
