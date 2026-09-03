import type {
  MeetingLiveTranscriptAuthorization,
  MeetingLiveTranscriptTrack,
} from "@app/shared/meeting-transcription";
import { resolveMeetingTranscriptionQwenBaseUrl } from "../../transcription/provider-endpoint";
import {
  DEFAULT_MEETING_TRANSCRIPTION_QWEN_LIVE_MODEL,
  createQwenRealtimeTranscriptionAuthorization,
} from "../../transcription/providers/qwen-realtime";
import { liveTranscriptAuthorizationGate } from "./authorization-gate";
import {
  claimMeetingLiveTranscriptLease,
  releaseMeetingLiveTranscriptLease,
  releaseMeetingLiveTranscriptTrackLease,
  renewMeetingLiveTranscriptLease,
} from "./dao";

export interface WorkspaceMeetingLiveTranscriptAuthorizationDependencies {
  claimLease: typeof claimMeetingLiveTranscriptLease;
  createQwenAuthorization: typeof createQwenRealtimeTranscriptionAuthorization;
  defaultQwenModel: typeof DEFAULT_MEETING_TRANSCRIPTION_QWEN_LIVE_MODEL;
  gateIssue: typeof liveTranscriptAuthorizationGate.issue;
  releaseLease: typeof releaseMeetingLiveTranscriptLease;
  releaseTrackLease: typeof releaseMeetingLiveTranscriptTrackLease;
  renewLease: typeof renewMeetingLiveTranscriptLease;
  resolveQwenBaseUrl: typeof resolveMeetingTranscriptionQwenBaseUrl;
}

const defaultDependencies: WorkspaceMeetingLiveTranscriptAuthorizationDependencies = {
  claimLease: claimMeetingLiveTranscriptLease,
  createQwenAuthorization: createQwenRealtimeTranscriptionAuthorization,
  defaultQwenModel: DEFAULT_MEETING_TRANSCRIPTION_QWEN_LIVE_MODEL,
  gateIssue: (input, mint) => liveTranscriptAuthorizationGate.issue(input, mint),
  releaseLease: releaseMeetingLiveTranscriptLease,
  releaseTrackLease: releaseMeetingLiveTranscriptTrackLease,
  renewLease: renewMeetingLiveTranscriptLease,
  resolveQwenBaseUrl: resolveMeetingTranscriptionQwenBaseUrl,
};

function optionalSpeechNoiseThreshold(raw: string | undefined): number | undefined {
  if (!raw?.trim()) {
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value >= -1 && value <= 1 ? value : undefined;
}

function issueLiveTranscriptLeaseAuthorization(
  input: {
    captureId: string;
    organizationId: string;
    track: MeetingLiveTranscriptTrack;
    userId: string;
  },
  mint: () => Promise<MeetingLiveTranscriptAuthorization>,
  dependencies: WorkspaceMeetingLiveTranscriptAuthorizationDependencies,
): Promise<MeetingLiveTranscriptAuthorization | "capacity"> {
  return dependencies.gateIssue(input, async () => {
    const claim = await dependencies.claimLease(input);
    if (claim === "capacity") {
      return "capacity";
    }
    try {
      return await mint();
    } catch (error) {
      if (claim === "created") {
        try {
          await dependencies.releaseTrackLease(input);
        } catch {
          // The short track lease expires server-side if cleanup cannot be delivered.
        }
      }
      throw error;
    }
  });
}

export function createWorkspaceMeetingLiveTranscriptAuthorization(
  input: {
    captureId: string;
    organizationId: string;
    track: MeetingLiveTranscriptTrack;
    userId: string;
  },
  dependencies: WorkspaceMeetingLiveTranscriptAuthorizationDependencies = defaultDependencies,
): Promise<MeetingLiveTranscriptAuthorization | "capacity" | "unavailable"> {
  const qwenApiKey = process.env.ALIBABA_API_KEY?.trim();
  if (!qwenApiKey) {
    return Promise.resolve("unavailable");
  }
  return issueLiveTranscriptLeaseAuthorization(
    input,
    () =>
      dependencies.createQwenAuthorization(
        {
          captureId: input.captureId,
          language: process.env.MEETING_TRANSCRIPTION_QWEN_LIVE_LANGUAGE?.trim() || undefined,
          speechNoiseThreshold: optionalSpeechNoiseThreshold(
            process.env.MEETING_TRANSCRIPTION_QWEN_LIVE_SPEECH_NOISE_THRESHOLD,
          ),
          track: input.track,
        },
        {
          apiKey: qwenApiKey,
          baseUrl: dependencies.resolveQwenBaseUrl(),
          model:
            process.env.MEETING_TRANSCRIPTION_QWEN_LIVE_MODEL?.trim() ||
            dependencies.defaultQwenModel,
          tokenTtlSeconds: Number.parseInt(
            process.env.MEETING_TRANSCRIPTION_QWEN_LIVE_TOKEN_TTL_SECONDS || "1800",
            10,
          ),
        },
      ),
    dependencies,
  );
}

export function heartbeatWorkspaceMeetingLiveTranscript(
  input: {
    captureId: string;
    organizationId: string;
    userId: string;
  },
  dependencies: WorkspaceMeetingLiveTranscriptAuthorizationDependencies = defaultDependencies,
): Promise<boolean> {
  return dependencies.renewLease(input);
}

export function releaseWorkspaceMeetingLiveTranscript(
  input: {
    captureId: string;
    organizationId: string;
    userId: string;
  },
  dependencies: WorkspaceMeetingLiveTranscriptAuthorizationDependencies = defaultDependencies,
): Promise<void> {
  return dependencies.releaseLease(input);
}
