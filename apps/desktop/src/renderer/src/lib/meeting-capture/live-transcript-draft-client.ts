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
import { connectMeetingLiveTranscriptProvider } from "./live-transcript-provider";
import {
  LocalMeetingLiveTranscriptAuthorizationError,
  shouldReconnectMeetingLiveTranscript,
} from "./live-transcript-provider-errors";
import { getSettings } from "../settings";
import { orpc } from "../orpc";

const liveTranscriptCapacityErrorSchema = z.object({
  code: z.literal("live-transcript-capacity-exhausted"),
});

const localAuthorizationCaptureIds = new Set<string>();

export const meetingLiveTranscriptDraft = createLiveTranscriptDraft({
  authorizationFailureMessage: (error) =>
    error instanceof LocalMeetingLiveTranscriptAuthorizationError ? error.message : null,
  authorizationFailureReason: (error) => {
    if (isApiError(error) && liveTranscriptCapacityErrorSchema.safeParse(error.payload).success) {
      return "capacity";
    }
    return "authorization";
  },
  authorizationMetadata: (authorization) => {
    if (authorization.provider !== "deepgram" && authorization.provider !== "qwen") {
      return null;
    }
    const metadata = { model: authorization.model, provider: authorization.provider };
    if (authorization.language) {
      return { ...metadata, language: authorization.language };
    }
    return metadata;
  },
  authorize: async (input) => {
    const provider = getSettings().meetingLiveTranscriptProvider;
    const localAuthorization = await orpc.transcriptionProviders.authorize({
      provider,
      track: input.track,
    });
    if (localAuthorization.state === "authorized") {
      localAuthorizationCaptureIds.add(input.captureId);
      return {
        ...localAuthorization.authorization,
        context: input.hints?.context,
        vocabulary: input.hints?.vocabulary,
      };
    }
    if (localAuthorization.state === "rejected") {
      throw new LocalMeetingLiveTranscriptAuthorizationError(localAuthorization.message);
    }
    if (provider === "deepgram") {
      throw new LocalMeetingLiveTranscriptAuthorizationError(
        "请先在 Desktop 设置中配置 Deepgram API Key",
      );
    }
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
  connect: connectMeetingLiveTranscriptProvider,
  createPcmTap: createBrowserPcmSidecar,
  heartbeat: async (captureId) => {
    if (localAuthorizationCaptureIds.has(captureId)) {
      return true;
    }
    const workspace = await resolveActiveWorkspace();
    if (!workspace) {
      return false;
    }
    await heartbeatMeetingLiveTranscript(workspace.slug, captureId);
    return true;
  },
  release: async (captureId) => {
    if (localAuthorizationCaptureIds.delete(captureId)) {
      return;
    }
    const workspace = await resolveActiveWorkspace();
    if (workspace) {
      await releaseMeetingLiveTranscript(workspace.slug, captureId);
    }
  },
  shouldReconnect: shouldReconnectMeetingLiveTranscript,
});
