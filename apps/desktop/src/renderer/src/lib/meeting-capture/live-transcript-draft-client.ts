import {
  createMeetingLiveTranscriptAuthorization,
  heartbeatMeetingLiveTranscript,
  releaseMeetingLiveTranscript,
} from "@/lib/client/meetings";
import { isApiError } from "@/lib/client/api-error";
import { resolveActiveWorkspace } from "@/lib/client/workspace";
import { z } from "zod";
import { createBrowserPcmSidecar } from "./browser-pcm-sidecar";
import { createLiveTranscriptDraft } from "./live-transcript-draft";
import { connectQwenRealtimeTranscription } from "./qwen-realtime-transport";

const liveTranscriptCapacityErrorSchema = z.object({
  code: z.literal("live-transcript-capacity-exhausted"),
});

export const meetingLiveTranscriptDraft = createLiveTranscriptDraft({
  authorizationFailureReason: (error) => {
    if (isApiError(error) && liveTranscriptCapacityErrorSchema.safeParse(error.payload).success) {
      return "capacity";
    }
    return "authorization";
  },
  authorize: async (input) => {
    const workspace = await resolveActiveWorkspace();
    if (!workspace) {
      throw new Error("当前没有可用 Workspace");
    }
    const authorization = await createMeetingLiveTranscriptAuthorization(workspace.slug, {
      captureId: input.captureId,
      track: input.track,
    });
    return {
      ...authorization,
      context: input.hints?.context,
      vocabulary: input.hints?.vocabulary,
    };
  },
  connect: connectQwenRealtimeTranscription,
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
