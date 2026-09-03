import type {
  HumanInterviewEvaluation,
  HumanInterviewRoundOutcome,
} from "@app/db-schema/studio-interviews";
import { submitHumanInterviewEvaluation } from "../dao/human-interview-evaluation";
import { endHumanInterviewMeetingsByRound } from "../dao/human-interview-meetings";
import {
  deleteHumanInterviewLiveKitRoom,
  HumanInterviewLiveKitConfigError,
} from "./human-interview-livekit";
import { stopActiveHumanInterviewRecordingByRoomName } from "./human-interview-recording-service";

interface HumanInterviewEvaluationSubmissionDependencies {
  deleteRoom: typeof deleteHumanInterviewLiveKitRoom;
  endMeetingsByRound: typeof endHumanInterviewMeetingsByRound;
  stopRecording: typeof stopActiveHumanInterviewRecordingByRoomName;
  submitEvaluation: typeof submitHumanInterviewEvaluation;
}

const defaultDependencies: HumanInterviewEvaluationSubmissionDependencies = {
  deleteRoom: deleteHumanInterviewLiveKitRoom,
  endMeetingsByRound: endHumanInterviewMeetingsByRound,
  stopRecording: stopActiveHumanInterviewRecordingByRoomName,
  submitEvaluation: submitHumanInterviewEvaluation,
};

export async function finalizeHumanInterviewRoundMeetings(
  input: { organizationId: string; roundId: string },
  overrides: Partial<HumanInterviewEvaluationSubmissionDependencies> = {},
): Promise<void> {
  const dependencies = { ...defaultDependencies, ...overrides };
  const roomNames = await dependencies.endMeetingsByRound(input);
  await Promise.all(
    roomNames.map(async (roomName) => {
      if (!roomName) {
        return;
      }
      try {
        await dependencies.stopRecording(roomName);
      } catch (error) {
        console.warn("failed to stop livekit human interview recording", error);
      }
      try {
        await dependencies.deleteRoom(roomName);
      } catch (error) {
        if (!(error instanceof HumanInterviewLiveKitConfigError)) {
          console.warn("failed to delete livekit human interview room", error);
        }
      }
    }),
  );
}

export async function submitAndFinalizeHumanInterviewEvaluation(
  input: {
    actorId: string;
    evaluation: HumanInterviewEvaluation;
    meetingSessionId: string | null;
    organizationId: string;
    outcome: HumanInterviewRoundOutcome;
    roundId: string;
    transcriptRevisionId: string | null;
  },
  overrides: Partial<HumanInterviewEvaluationSubmissionDependencies> = {},
): Promise<boolean> {
  const dependencies = { ...defaultDependencies, ...overrides };
  const submitted = await dependencies.submitEvaluation({
    actorId: input.actorId,
    evaluation: input.evaluation,
    meetingSessionId: input.meetingSessionId,
    organizationId: input.organizationId,
    outcome: input.outcome,
    roundId: input.roundId,
    transcriptRevisionId: input.transcriptRevisionId,
  });
  if (!submitted) {
    return false;
  }
  await finalizeHumanInterviewRoundMeetings(
    { organizationId: input.organizationId, roundId: input.roundId },
    dependencies,
  );
  return true;
}
