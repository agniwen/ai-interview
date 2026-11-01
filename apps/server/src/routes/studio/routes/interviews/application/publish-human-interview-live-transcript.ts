import { recoverHumanInterviewReviewFromLiveTranscript } from "../dao/human-interview-evaluation";
import { requestAutomaticHumanInterviewEvaluation } from "../utils/human-interview-evaluation-service";

/** 会议结束后立即把面试官字幕发布为正式转录并生成面评；没有字幕时等待录音转写。 */
export async function publishHumanInterviewLiveTranscriptAfterEnd(input: {
  actorId: string;
  meetingId: string;
  organizationId: string;
  roundId?: string;
}): Promise<void> {
  try {
    const published = await recoverHumanInterviewReviewFromLiveTranscript(input);
    if (published.status === "ready") {
      await requestAutomaticHumanInterviewEvaluation({
        meetingSessionId: published.meetingSessionId,
        organizationId: input.organizationId,
      });
    }
  } catch (error) {
    console.warn("failed to publish human interview live transcript", error);
  }
}
