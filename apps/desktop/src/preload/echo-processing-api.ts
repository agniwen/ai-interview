import type { MeetingQuestionExchange } from "@app/shared/meeting-answer";
import type { MeetingLiveSummarySnapshot } from "@app/shared/meeting-live-summary";
import type { EchoTranscript } from "@app/shared/meeting-device-processing";
import type {
  MeetingIntelligencePayload,
  MeetingIntelligenceTemplate,
} from "@app/shared/meeting-intelligence";

export interface EchoProcessingOwner {
  accountId: string;
  workspaceId: string;
  workspaceSlug: string;
}
export interface EchoProcessingStatus {
  meetingId: string;
  state: "unbound" | "processing" | "paused" | "failed" | "complete" | "deleting" | "deleted";
  audioReleased: boolean;
  error: string | null;
  backupVerifiedAt: string | null;
  tasks: { kind: string; state: string; retryCount: number }[];
}
export interface EchoProcessingApi {
  context: (
    input: EchoProcessingOwner & { meetingId: string },
  ) => Promise<{ canAdopt: boolean; waitingOnAnotherDevice: boolean; complete: boolean }>;
  localQuestions: (input: {
    meetingId: string;
    threadId: string;
    accountId: string;
  }) => Promise<MeetingQuestionExchange[]>;
  regenerate: (
    input: EchoProcessingOwner & { meetingId: string; template: MeetingIntelligenceTemplate },
  ) => Promise<string>;
  question: (
    input: EchoProcessingOwner & {
      meetingId: string;
      threadId: string;
      question: string;
      requestId: string;
    },
  ) => Promise<string>;
  adopt: (input: EchoProcessingOwner & { meetingId: string }) => Promise<void>;
  purge: (input: EchoProcessingOwner & { meetingId: string }) => Promise<void>;
  status: (meetingId: string, accountId?: string) => Promise<EchoProcessingStatus>;
  retry: (meetingId: string) => Promise<void>;
  releaseAudio: (meetingId: string) => Promise<void>;
  localResults: (
    meetingId: string,
    accountId?: string,
  ) => Promise<{
    transcript: EchoTranscript | null;
    intelligence: MeetingIntelligencePayload | null;
    liveSummary: MeetingLiveSummarySnapshot | null;
  }>;
}
