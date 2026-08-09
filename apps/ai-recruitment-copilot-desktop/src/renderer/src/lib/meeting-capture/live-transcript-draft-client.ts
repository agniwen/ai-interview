import {
  createMeetingLiveTranscriptAuthorization,
  heartbeatMeetingLiveTranscript,
  releaseMeetingLiveTranscript,
} from "@/lib/client/meetings";
import { isApiError } from "@/lib/client/api-error";
import { resolveActiveWorkspace } from "@/lib/client/workspace";
import { createBrowserPcmSidecar } from "./browser-pcm-sidecar";
import { createLiveTranscriptDraft } from "./live-transcript-draft";
import { connectOpenAiRealtimeTranscription } from "./openai-realtime-transport";

export const meetingLiveTranscriptDraft = createLiveTranscriptDraft({
  authorizationFailureReason: (error) => {
    if (
      isApiError(error) &&
      typeof error.payload === "object" &&
      error.payload !== null &&
      "code" in error.payload &&
      error.payload.code === "live-transcript-capacity-exhausted"
    ) {
      return "capacity";
    }
    return "authorization";
  },
  authorize: async (input) => {
    const workspace = await resolveActiveWorkspace();
    if (!workspace) {
      throw new Error("当前没有可用 Workspace");
    }
    return createMeetingLiveTranscriptAuthorization(workspace.slug, input);
  },
  connect: connectOpenAiRealtimeTranscription,
  createPcmTap: createBrowserPcmSidecar,
  heartbeat: async (captureId) => {
    const workspace = await resolveActiveWorkspace();
    if (!workspace) {
      return false;
    }
    await heartbeatMeetingLiveTranscript(workspace.slug, captureId);
    return true;
  },
  release: async (captureId) => {
    const workspace = await resolveActiveWorkspace();
    if (workspace) {
      await releaseMeetingLiveTranscript(workspace.slug, captureId);
    }
  },
  shouldReconnect: (error) =>
    !isApiError(error) || ![400, 401, 403, 404, 409, 422, 429, 503].includes(error.status),
});
