import {
  createDeepgramRealtimeTranscriptionAuthorization,
  createQwenRealtimeTranscriptionAuthorization,
  DEFAULT_QWEN_LIVE_MODEL,
  MeetingLiveTranscriptProviderAuthorizationError,
} from "@app/meeting-live-transcript/provider-authorizations";
import type {
  MeetingLiveTranscriptProviderId,
  MeetingLiveTranscriptTrack,
} from "@app/shared/meeting-transcription";
import { readMeetingTranscriptionProviderCredential } from "./meeting-transcription-provider-credentials";

export async function createLocalMeetingLiveTranscriptAuthorization(input: {
  provider: MeetingLiveTranscriptProviderId;
  track: MeetingLiveTranscriptTrack;
}) {
  const apiKey = readMeetingTranscriptionProviderCredential(input.provider);
  if (!apiKey) {
    return { state: "credential-missing" as const };
  }
  try {
    const authorization =
      input.provider === "deepgram"
        ? await createDeepgramRealtimeTranscriptionAuthorization(
            { language: "zh-CN", track: input.track },
            { apiKey },
          )
        : await createQwenRealtimeTranscriptionAuthorization(
            { language: "zh", track: input.track },
            {
              apiKey,
              baseUrl: "https://dashscope.aliyuncs.com",
              model: DEFAULT_QWEN_LIVE_MODEL,
            },
          );
    return { authorization, state: "authorized" as const };
  } catch (error) {
    if (error instanceof MeetingLiveTranscriptProviderAuthorizationError) {
      console.warn("[meeting-transcription] Provider authorization rejected", {
        message: error.message,
        provider: error.provider,
        status: error.status,
      });
      return {
        message: error.message,
        provider: error.provider,
        state: "rejected" as const,
        status: error.status,
      };
    }
    throw error;
  }
}
