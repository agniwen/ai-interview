import type { Request } from "express";

export const TOP_LEVEL_LIVEKIT_PORT = Symbol("TOP_LEVEL_LIVEKIT_PORT");
export const TOP_LEVEL_LIVEKIT_HUMAN_MEETING_PORT = Symbol("TOP_LEVEL_LIVEKIT_HUMAN_MEETING_PORT");

export interface TopLevelLiveKitHumanMeetingPort {
  handle(input: {
    event: string;
    eventId?: string;
    identity?: string;
    occurredAt: Date;
    roomName: string;
  }): Promise<void>;
}

export interface TopLevelLiveKitPort {
  handleWebhook(
    request: Request,
  ): Promise<
    | { handled: "human-interview"; ok: true }
    | { ignored: string; ok: true }
    | { matched: number; ok: true }
  >;
}
