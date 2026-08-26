import { meetingLiveTranscriptTrackSchema } from "@arc/shared/meeting-transcription";
import type { MeetingLiveTranscriptAuthorization } from "@arc/shared/meeting-transcription";
import { z } from "zod";

const liveTranscriptClientMessageSchema = z
  .object({
    authorization: z
      .object({
        baseUrl: z.string(),
        clientSecret: z.string(),
        expiresAt: z.string(),
        language: z.string().optional(),
        model: z.string(),
        provider: z.literal("qwen"),
        track: meetingLiveTranscriptTrackSchema,
      })
      .strict(),
    type: z.literal("start-meeting-live-transcript-client"),
  })
  .strict();

interface MessagePortHandoff {
  page: Pick<Window, "location">;
  postMessage: (
    channel: string,
    message: MeetingLiveTranscriptAuthorization | null,
    ports: MessagePort[],
  ) => void;
}

/** Forward same-window renderer ports to their main-process handlers. */
export function createMessagePortHandoff({ page, postMessage }: MessagePortHandoff) {
  return (event: Pick<MessageEvent, "data" | "origin" | "ports" | "source">) => {
    if (
      event.source !== page ||
      event.origin !== page.location.origin ||
      event.ports.length !== 1
    ) {
      return;
    }
    const [serverPort] = event.ports;
    if (event.data === "start-orpc-client") {
      postMessage("start-orpc-server", null, [serverPort]);
      return;
    }
    // Preload probes eval before the page's CSP meta tag disables it. Parse without
    // JIT so the cached probe cannot break the later live-transcript port handoff.
    const liveTranscriptMessage = liveTranscriptClientMessageSchema.safeParse(event.data, {
      jitless: true,
    });
    if (liveTranscriptMessage.success) {
      console.log("[preload] forwarding live-transcript port");
      postMessage("meeting-live-transcript:port", liveTranscriptMessage.data.authorization, [
        serverPort,
      ]);
    }
  };
}
