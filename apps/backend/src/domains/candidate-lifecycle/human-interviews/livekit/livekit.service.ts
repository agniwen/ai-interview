import { rawBackendEnvironment } from "../../../../config/raw-backend-environment.js";
import {
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from "@nestjs/common";
import { EgressStatus } from "@livekit/protocol";
import { eq } from "drizzle-orm";
import type { Request } from "express";
import { WebhookReceiver } from "livekit-server-sdk";
import { interviewConversation } from "@arc/db-schema/schema";
import { HTTP_DATABASE } from "../../../../infrastructure/http/http.ports.js";
import type { HttpDatabase } from "../../../../infrastructure/http/http.ports.js";
import { HUMAN_MEETING_LIVEKIT_PORT } from "./livekit.port.js";
import type { HumanMeetingLiveKitPort, LiveKitWebhookPort } from "./livekit.port.js";

type RecordingStatus = "active" | "completed" | "failed";

function mapEgressStatus(status: EgressStatus): RecordingStatus {
  if (status === EgressStatus.EGRESS_COMPLETE) {
    return "completed";
  }
  if (
    status === EgressStatus.EGRESS_FAILED ||
    status === EgressStatus.EGRESS_ABORTED ||
    status === EgressStatus.EGRESS_LIMIT_REACHED
  ) {
    return "failed";
  }
  return "active";
}

function durationSeconds(startedAt: bigint, endedAt: bigint): number | null {
  if (startedAt <= 0n || endedAt <= 0n || endedAt < startedAt) {
    return null;
  }
  return Number((endedAt - startedAt) / 1_000_000_000n);
}

async function readRequestText(request: Request): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > 2_000_000) {
      throw new UnauthorizedException("LiveKit webhook body is too large", {
        errorCode: "LIVEKIT_WEBHOOK_TOO_LARGE",
      });
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

@Injectable()
export class LiveKitService implements LiveKitWebhookPort {
  private receiver: WebhookReceiver | null = null;

  constructor(
    @Inject(HTTP_DATABASE)
    private readonly database: HttpDatabase,
    @Inject(HUMAN_MEETING_LIVEKIT_PORT)
    private readonly humanMeetings: HumanMeetingLiveKitPort,
  ) {}

  async handleWebhook(request: Request) {
    const receiver = this.getReceiver();
    const body = await readRequestText(request);
    let event: Awaited<ReturnType<WebhookReceiver["receive"]>>;
    try {
      event = await receiver.receive(body, request.header("authorization"));
    } catch {
      throw new UnauthorizedException("Invalid LiveKit webhook signature", {
        errorCode: "LIVEKIT_WEBHOOK_SIGNATURE_INVALID",
      });
    }

    const roomName = event.room?.name;
    if (roomName?.startsWith("human_")) {
      await this.humanMeetings.handle({
        event: event.event,
        eventId: event.id || undefined,
        identity: event.participant?.identity,
        occurredAt: event.createdAt > 0n ? new Date(Number(event.createdAt) * 1000) : new Date(),
        roomName,
      });
      return { handled: "human-interview", ok: true } as const;
    }
    if (event.event !== "egress_ended") {
      return { ignored: event.event, ok: true } as const;
    }
    const info = event.egressInfo;
    if (!info?.egressId) {
      return { ignored: "missing-egress-id", ok: true } as const;
    }
    const updated = await this.database
      .update(interviewConversation)
      .set({
        lastSyncedAt: new Date(),
        recordingDurationSecs: durationSeconds(info.startedAt, info.endedAt),
        recordingStatus: mapEgressStatus(info.status),
      })
      .where(eq(interviewConversation.recordingEgressId, info.egressId))
      .returning({ interviewRecordId: interviewConversation.interviewRecordId });
    return { matched: updated.length, ok: true } as const;
  }

  private getReceiver(): WebhookReceiver {
    if (this.receiver) {
      return this.receiver;
    }
    const apiKey = rawBackendEnvironment.LIVEKIT_API_KEY?.trim();
    const apiSecret = rawBackendEnvironment.LIVEKIT_API_SECRET?.trim();
    if (!(apiKey && apiSecret)) {
      throw new InternalServerErrorException("LiveKit webhook is not configured", {
        errorCode: "LIVEKIT_WEBHOOK_NOT_CONFIGURED",
      });
    }
    this.receiver = new WebhookReceiver(apiKey, apiSecret);
    return this.receiver;
  }
}
