import type {
  MeetingLiveTranscriptAuthorization,
  MeetingLiveTranscriptProviderCapabilities,
  MeetingLiveTranscriptProviderId,
} from "@app/shared/meeting-transcription";
import { MEETING_LIVE_TRANSCRIPT_PROVIDER_CAPABILITIES } from "@app/shared/meeting-transcription";
import type { LiveTranscriptDraftDependencies } from "./live-transcript-draft";
import { connectDeepgramRealtimeTranscription } from "./deepgram-realtime-transport";
import { connectQwenRealtimeTranscription } from "./qwen-realtime-transport";

type ConnectLiveTranscriptProvider =
  LiveTranscriptDraftDependencies<MeetingLiveTranscriptAuthorization>["connect"];

export interface MeetingLiveTranscriptProvider {
  capabilities: MeetingLiveTranscriptProviderCapabilities;
  connect: ConnectLiveTranscriptProvider;
  id: MeetingLiveTranscriptProviderId;
  label: string;
}

export const MEETING_LIVE_TRANSCRIPT_PROVIDERS = {
  deepgram: {
    capabilities: MEETING_LIVE_TRANSCRIPT_PROVIDER_CAPABILITIES.deepgram,
    connect: connectDeepgramRealtimeTranscription,
    id: "deepgram",
    label: "Deepgram Nova-3",
  },
  qwen: {
    capabilities: MEETING_LIVE_TRANSCRIPT_PROVIDER_CAPABILITIES.qwen,
    connect: connectQwenRealtimeTranscription,
    id: "qwen",
    label: "Qwen 实时语音识别",
  },
} satisfies Record<MeetingLiveTranscriptProviderId, MeetingLiveTranscriptProvider>;

export const connectMeetingLiveTranscriptProvider: ConnectLiveTranscriptProvider = (input) =>
  input.authorization.provider === "deepgram" || input.authorization.provider === "qwen"
    ? MEETING_LIVE_TRANSCRIPT_PROVIDERS[input.authorization.provider].connect(input)
    : Promise.reject(new Error(`Desktop 不支持实时转录 Provider：${input.authorization.provider}`));
