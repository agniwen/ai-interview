import { oc } from "@orpc/contract";
import {
  deepgramEndpointingMsSchema,
  meetingLiveTranscriptAuthorizationSchema,
  meetingLiveTranscriptProviderSchema,
  meetingLiveTranscriptTrackSchema,
} from "@app/shared/meeting-transcription";
import { z } from "zod";

/**
 * Cross-process oRPC contract for desktop settings.
 *
 * Lives in `src/preload/` as the shared contract surface: the main process
 * implements it (`src/main/orpc.ts`) and the renderer types its client
 * against it (`src/renderer/src/lib/orpc.ts`). Type-only + zod — no electron
 * or node imports, so both tsconfigs can consume it.
 */
export const themeModeSchema = z.enum(["light", "dark", "system"]);

export const desktopSettingsSchema = z.object({
  deepgramEndpointingMs: deepgramEndpointingMsSchema,
  meetingLiveTranscriptProvider: meetingLiveTranscriptProviderSchema,
  notifyOnFinish: z.boolean(),
  theme: themeModeSchema,
  transparentBackground: z.boolean(),
});

export const meetingTranscriptionProviderCredentialStatusSchema = z.object({
  deepgram: z.boolean(),
  qwen: z.boolean(),
  secureStorageAvailable: z.boolean(),
});

const meetingTranscriptionProviderCredentialInputSchema = z.object({
  apiKey: z.string().trim().min(1).max(4096),
  provider: meetingLiveTranscriptProviderSchema,
});

const meetingTranscriptionProviderInputSchema = z.object({
  provider: meetingLiveTranscriptProviderSchema,
});

const createLocalMeetingLiveTranscriptAuthorizationSchema = z.object({
  provider: meetingLiveTranscriptProviderSchema,
  track: meetingLiveTranscriptTrackSchema,
});

const localMeetingLiveTranscriptAuthorizationResultSchema = z.discriminatedUnion("state", [
  z.object({
    authorization: meetingLiveTranscriptAuthorizationSchema,
    state: z.literal("authorized"),
  }),
  z.object({ state: z.literal("credential-missing") }),
  z.object({
    message: z.string().min(1).max(500),
    provider: meetingLiveTranscriptProviderSchema,
    state: z.literal("rejected"),
    status: z.number().int().min(100).max(599),
  }),
]);

export const orpcContract = oc.router({
  settings: {
    get: oc.output(desktopSettingsSchema),
    set: oc.input(desktopSettingsSchema.partial()).output(desktopSettingsSchema),
  },
  transcriptionProviders: {
    authorize: oc
      .input(createLocalMeetingLiveTranscriptAuthorizationSchema)
      .output(localMeetingLiveTranscriptAuthorizationResultSchema),
    clearCredential: oc
      .input(meetingTranscriptionProviderInputSchema)
      .output(meetingTranscriptionProviderCredentialStatusSchema),
    getCredentialStatus: oc.output(meetingTranscriptionProviderCredentialStatusSchema),
    setCredential: oc
      .input(meetingTranscriptionProviderCredentialInputSchema)
      .output(meetingTranscriptionProviderCredentialStatusSchema),
  },
});

export type DesktopSettings = z.infer<typeof desktopSettingsSchema>;
export type ThemeMode = z.infer<typeof themeModeSchema>;
