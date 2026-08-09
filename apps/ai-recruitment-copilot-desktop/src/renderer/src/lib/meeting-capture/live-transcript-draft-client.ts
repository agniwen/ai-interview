import { createMeetingLiveTranscriptAuthorization } from "@/lib/client/meetings";
import { isApiError } from "@/lib/client/api-error";
import { resolveActiveWorkspace } from "@/lib/client/workspace";
import { createBrowserPcmSidecar } from "./browser-pcm-sidecar";
import { createLiveTranscriptDraft } from "./live-transcript-draft";
import { connectOpenAiRealtimeTranscription } from "./openai-realtime-transport";

export const meetingLiveTranscriptDraft = createLiveTranscriptDraft({
  authorize: async (input) => {
    const workspace = await resolveActiveWorkspace();
    if (!workspace) {
      throw new Error("当前没有可用 Workspace");
    }
    return createMeetingLiveTranscriptAuthorization(workspace.slug, input);
  },
  connect: connectOpenAiRealtimeTranscription,
  createPcmTap: createBrowserPcmSidecar,
  shouldReconnect: (error) =>
    !isApiError(error) || ![400, 401, 403, 404, 409, 422, 503].includes(error.status),
});
