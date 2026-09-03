import { Buffer } from "node:buffer";
import type { MeetingLiveTranscriptAuthorization } from "@app/shared/meeting-transcription";
import { meetingLiveTranscriptTrackSchema } from "@app/shared/meeting-transcription";
import { z } from "zod";

const captureIdSchema = z.string().uuid();
const sectionIdSchema = z.string().min(1).max(512);

export interface HumanInterviewLiveTranscriptContext extends Record<string, unknown> {
  apiOrigin: string;
  authorization: MeetingLiveTranscriptAuthorization;
  captureId: string;
  inviteToken: string;
  sectionId: string;
  track: "microphone" | "system";
}

interface Dependencies {
  authorize: (input: {
    captureId: string;
    inviteToken: string;
    request: Request;
    track: "microphone" | "system";
  }) => Promise<MeetingLiveTranscriptAuthorization>;
}

function reject(status: number, message: string): never {
  throw new Response(message, { status });
}

async function authorizeThroughServerApi(input: {
  captureId: string;
  inviteToken: string;
  request: Request;
  track: "microphone" | "system";
}): Promise<MeetingLiveTranscriptAuthorization> {
  const url = new URL(
    `/api/public/human-interview-meetings/interviewer/${encodeURIComponent(
      input.inviteToken,
    )}/live-transcript`,
    input.request.url,
  );
  const response = await fetch(url, {
    body: JSON.stringify({ captureId: input.captureId, track: input.track }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  // SAFETY: This is the JSON contract of the matching server-owned Hono route;
  // the required authorization field is checked before it is returned.
  const body = (await response.json()) as {
    authorization?: MeetingLiveTranscriptAuthorization;
    error?: string;
  };
  if (!(response.ok && body.authorization)) {
    reject(response.status, body.error ?? "实时字幕服务暂不可用。");
  }
  return body.authorization;
}

const defaultDependencies: Dependencies = {
  authorize: authorizeThroughServerApi,
};

function protocolValue(protocols: string[], prefix: string): string {
  const protocol = protocols.find((candidate) => candidate.startsWith(prefix));
  if (!protocol) {
    return reject(400, "实时字幕连接参数不完整。");
  }
  return protocol.slice(prefix.length);
}

function decodeInviteToken(encoded: string): string {
  try {
    const token = Buffer.from(encoded, "base64url").toString("utf-8");
    if (!token || token.length > 4096) {
      return reject(400, "实时字幕邀请凭证无效。");
    }
    return token;
  } catch {
    return reject(400, "实时字幕邀请凭证无效。");
  }
}

function validateOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    reject(403, "实时字幕连接来源无效。");
  }
}

export async function authorizeHumanInterviewLiveTranscriptUpgrade(
  request: Request,
  dependencies: Partial<Dependencies> = {},
): Promise<HumanInterviewLiveTranscriptContext> {
  validateOrigin(request);
  const deps = { ...defaultDependencies, ...dependencies };
  const protocols = (request.headers.get("sec-websocket-protocol") ?? "")
    .split(",")
    .map((value) => value.trim());
  if (!protocols.includes("arc-human-interview-transcript")) {
    reject(400, "实时字幕协议无效。");
  }
  const inviteToken = decodeInviteToken(protocolValue(protocols, "arc-invite."));
  const captureId = captureIdSchema.safeParse(protocolValue(protocols, "arc-capture."));
  const track = meetingLiveTranscriptTrackSchema.safeParse(protocolValue(protocols, "arc-track."));
  const sectionId = sectionIdSchema.safeParse(
    decodeInviteToken(protocolValue(protocols, "arc-section.")),
  );
  if (
    !(captureId.success && track.success && sectionId.success) ||
    !sectionId.data.startsWith(`${captureId.data}:${track.data}:`)
  ) {
    reject(400, "实时字幕连接参数无效。");
  }
  const authorization = await deps.authorize({
    captureId: captureId.data,
    inviteToken,
    request,
    track: track.data,
  });
  return {
    apiOrigin: new URL(request.url).origin,
    authorization,
    captureId: captureId.data,
    inviteToken,
    sectionId: sectionId.data,
    track: track.data,
  };
}
