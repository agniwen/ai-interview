import type { Request } from "express";

export const LIVEKIT_WEBHOOK_PORT = Symbol("LIVEKIT_WEBHOOK_PORT");
export const HUMAN_MEETING_LIVEKIT_PORT = Symbol("HUMAN_MEETING_LIVEKIT_PORT");

export interface HumanMeetingLiveKitPort {
  handle(input: {
    event: string;
    eventId?: string;
    identity?: string;
    occurredAt: Date;
    roomName: string;
  }): Promise<void>;
}

export interface LiveKitWebhookPort {
  handleWebhook(
    request: Request,
  ): Promise<
    | { handled: "human-interview"; ok: true }
    | { ignored: string; ok: true }
    | { matched: number; ok: true }
  >;
}
