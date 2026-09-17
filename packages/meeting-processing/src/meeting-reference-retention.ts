import { assertNoRecruitingReferences } from "@app/database/recruiting-reference-retention";
import type { RecruitingExecutor } from "@app/database/recruiting-records";
import { meetingTranscriptRevision } from "@app/db-schema/schema";
import { eq } from "drizzle-orm";

/** 在对象存储清理前检查会议及转写版本是否仍被当前招聘数据引用。 */
export async function assertMeetingRecruitingReferences(
  executor: RecruitingExecutor,
  meetingId: string,
) {
  await assertNoRecruitingReferences(executor, "meeting_session", meetingId);
  const revisions = await executor
    .select({ id: meetingTranscriptRevision.id })
    .from(meetingTranscriptRevision)
    .where(eq(meetingTranscriptRevision.meetingId, meetingId));
  for (const revision of revisions) {
    await assertNoRecruitingReferences(executor, "meeting_transcript_revision", revision.id);
  }
}
