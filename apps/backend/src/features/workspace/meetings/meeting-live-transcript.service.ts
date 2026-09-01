/* oxlint-disable max-classes-per-file, require-await -- The local rate-limit error belongs to this service, and async port methods intentionally preserve their Promise contract. */
import { rawBackendEnvironment } from "../../../config/raw-backend-environment.js";
import { Inject, Injectable } from "@nestjs/common";
import { meetingLiveTranscriptLease } from "@arc/db-schema/schema";
import type {
  MeetingLiveTranscriptAuthorization,
  MeetingLiveTranscriptTrack,
} from "@arc/shared/meeting-transcription";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { WORKSPACE_DATABASE_PORT } from "../workspace.ports.js";
import type { WorkspaceDatabasePort } from "../workspace.ports.js";

const CAPACITY_LOCK = "meeting-live-transcript-capacity";
const LEASE_MS = 90_000;
const DEFAULT_MODEL = "qwen-audio-3.0-asr-flash-streaming";
const MAX_TOKEN_TTL_SECONDS = 1800;
const RATE_WINDOW_MS = 60_000;

interface LeaseIdentity {
  captureId: string;
  organizationId: string;
  userId: string;
}
type TrackLeaseIdentity = LeaseIdentity & { track: MeetingLiveTranscriptTrack };
interface RateWindow {
  count: number;
  resetsAt: number;
}

const tokenResponseSchema = z
  .object({ expires_at: z.number().int().positive(), token: z.string().min(1) })
  .passthrough();

export class LiveTranscriptRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Live transcript authorization rate limit exceeded");
    this.name = "LiveTranscriptRateLimitError";
  }
}

@Injectable()
export class MeetingLiveTranscriptService {
  private readonly captureTrackWindows = new Map<string, RateWindow>();
  private readonly inFlight = new Map<
    string,
    Promise<MeetingLiveTranscriptAuthorization | "capacity">
  >();
  private readonly userWindows = new Map<string, RateWindow>();

  constructor(@Inject(WORKSPACE_DATABASE_PORT) private readonly database: WorkspaceDatabasePort) {}

  async authorize(
    input: TrackLeaseIdentity,
  ): Promise<MeetingLiveTranscriptAuthorization | "capacity" | "unavailable"> {
    const apiKey = rawBackendEnvironment.ALIBABA_API_KEY?.trim();
    if (!apiKey) {
      return "unavailable";
    }
    const key = `${input.organizationId}:${input.userId}:${input.captureId}:${input.track}`;
    const active = this.inFlight.get(key);
    if (active) {
      return active;
    }
    this.consumeRateLimit(key, `${input.organizationId}:${input.userId}`);
    const grant = this.issue(input, apiKey);
    this.inFlight.set(key, grant);
    try {
      return await grant;
    } finally {
      if (this.inFlight.get(key) === grant) {
        this.inFlight.delete(key);
      }
    }
  }

  async heartbeat(input: LeaseIdentity): Promise<boolean> {
    return this.database.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${CAPACITY_LOCK}))`);
      const now = new Date();
      const renewed = await tx
        .update(meetingLiveTranscriptLease)
        .set({ expiresAt: new Date(now.getTime() + LEASE_MS), updatedAt: now })
        .where(
          and(
            eq(meetingLiveTranscriptLease.captureId, input.captureId),
            eq(meetingLiveTranscriptLease.organizationId, input.organizationId),
            eq(meetingLiveTranscriptLease.userId, input.userId),
            gt(meetingLiveTranscriptLease.expiresAt, now),
          ),
        )
        .returning({ captureId: meetingLiveTranscriptLease.captureId });
      return renewed.length > 0;
    });
  }

  async release(input: LeaseIdentity): Promise<void> {
    await this.database
      .delete(meetingLiveTranscriptLease)
      .where(
        and(
          eq(meetingLiveTranscriptLease.captureId, input.captureId),
          eq(meetingLiveTranscriptLease.organizationId, input.organizationId),
          eq(meetingLiveTranscriptLease.userId, input.userId),
        ),
      );
  }

  private consumeRateLimit(captureTrackKey: string, userKey: string): void {
    const now = Date.now();
    const consume = (windows: Map<string, RateWindow>, key: string, limit: number) => {
      const existing = windows.get(key);
      const window =
        existing && existing.resetsAt > now
          ? existing
          : { count: 0, resetsAt: now + RATE_WINDOW_MS };
      windows.set(key, window);
      if (window.count >= limit) {
        throw new LiveTranscriptRateLimitError(
          Math.max(1, Math.ceil((window.resetsAt - now) / 1000)),
        );
      }
      window.count += 1;
    };
    consume(this.captureTrackWindows, captureTrackKey, 10);
    consume(this.userWindows, userKey, 20);
  }

  private async issue(
    input: TrackLeaseIdentity,
    apiKey: string,
  ): Promise<MeetingLiveTranscriptAuthorization | "capacity"> {
    const claim = await this.claim(input);
    if (claim === "capacity") {
      return claim;
    }
    try {
      return await this.mint(input, apiKey);
    } catch (error) {
      if (claim === "created") {
        await this.database
          .delete(meetingLiveTranscriptLease)
          .where(
            and(
              eq(meetingLiveTranscriptLease.captureId, input.captureId),
              eq(meetingLiveTranscriptLease.organizationId, input.organizationId),
              eq(meetingLiveTranscriptLease.track, input.track),
              eq(meetingLiveTranscriptLease.userId, input.userId),
            ),
          )
          .catch(() => {
            // The original authorization error remains authoritative during best-effort cleanup.
          });
      }
      throw error;
    }
  }

  private async claim(input: TrackLeaseIdentity): Promise<"capacity" | "created" | "renewed"> {
    return this.database.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${CAPACITY_LOCK}))`);
      const now = new Date();
      const existing = await tx.query.meetingLiveTranscriptLease.findFirst({
        where: {
          captureId: input.captureId,
          organizationId: input.organizationId,
          track: input.track,
        },
      });
      if (existing?.userId === input.userId && existing.expiresAt > now) {
        await tx
          .update(meetingLiveTranscriptLease)
          .set({ expiresAt: new Date(now.getTime() + LEASE_MS), updatedAt: now })
          .where(
            and(
              eq(meetingLiveTranscriptLease.captureId, input.captureId),
              eq(meetingLiveTranscriptLease.organizationId, input.organizationId),
              eq(meetingLiveTranscriptLease.track, input.track),
            ),
          );
        return "renewed";
      }
      if (existing && existing.expiresAt > now) {
        return "capacity";
      }
      const [activeCapture] = await tx
        .select({ userId: meetingLiveTranscriptLease.userId })
        .from(meetingLiveTranscriptLease)
        .where(
          and(
            eq(meetingLiveTranscriptLease.captureId, input.captureId),
            eq(meetingLiveTranscriptLease.organizationId, input.organizationId),
            gt(meetingLiveTranscriptLease.expiresAt, now),
          ),
        )
        .limit(1);
      if (activeCapture && activeCapture.userId !== input.userId) {
        return "capacity";
      }
      if (!activeCapture) {
        const [active] = await tx
          .select({
            count: sql<number>`count(distinct (${meetingLiveTranscriptLease.organizationId}, ${meetingLiveTranscriptLease.captureId}))::int`,
          })
          .from(meetingLiveTranscriptLease)
          .where(gt(meetingLiveTranscriptLease.expiresAt, now));
        const parsed = Number.parseInt(
          rawBackendEnvironment.MEETING_LIVE_TRANSCRIPT_CONCURRENCY || "100",
          10,
        );
        const capacity = Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
        if ((active?.count ?? 0) >= capacity) {
          return "capacity";
        }
      }
      await tx
        .insert(meetingLiveTranscriptLease)
        .values({
          captureId: input.captureId,
          expiresAt: new Date(now.getTime() + LEASE_MS),
          organizationId: input.organizationId,
          track: input.track,
          updatedAt: now,
          userId: input.userId,
        })
        .onConflictDoUpdate({
          set: {
            expiresAt: new Date(now.getTime() + LEASE_MS),
            updatedAt: now,
            userId: input.userId,
          },
          target: [
            meetingLiveTranscriptLease.organizationId,
            meetingLiveTranscriptLease.captureId,
            meetingLiveTranscriptLease.track,
          ],
        });
      return "created";
    });
  }

  private async mint(
    input: TrackLeaseIdentity,
    apiKey: string,
  ): Promise<MeetingLiveTranscriptAuthorization> {
    const rawBaseUrl =
      rawBackendEnvironment.MEETING_TRANSCRIPTION_QWEN_BASE_URL?.trim() ||
      rawBackendEnvironment.ALIBABA_BASE_URL?.trim() ||
      "https://dashscope.aliyuncs.com";
    const { origin } = new URL(rawBaseUrl);
    const model =
      rawBackendEnvironment.MEETING_TRANSCRIPTION_QWEN_LIVE_MODEL?.trim() || DEFAULT_MODEL;
    const requestedTtl = Number.parseInt(
      rawBackendEnvironment.MEETING_TRANSCRIPTION_QWEN_LIVE_TOKEN_TTL_SECONDS || "1800",
      10,
    );
    const ttl = Number.isFinite(requestedTtl)
      ? Math.min(Math.max(1, requestedTtl), MAX_TOKEN_TTL_SECONDS)
      : 1800;
    const response = await fetch(`${origin}/api/v1/tokens?expire_in_seconds=${ttl}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(
        `DashScope live transcription authorization failed with HTTP ${response.status}`,
      );
    }
    const token = tokenResponseSchema.parse(await response.json());
    const thresholdRaw =
      rawBackendEnvironment.MEETING_TRANSCRIPTION_QWEN_LIVE_SPEECH_NOISE_THRESHOLD;
    const threshold = thresholdRaw?.trim() ? Number(thresholdRaw) : undefined;
    const authorization: MeetingLiveTranscriptAuthorization = {
      baseUrl: `wss://${new URL(origin).hostname}/api-ws/v1/${model.startsWith(DEFAULT_MODEL) ? "inference" : "realtime"}`,
      clientSecret: token.token,
      expiresAt: new Date(token.expires_at * 1000).toISOString(),
      language: rawBackendEnvironment.MEETING_TRANSCRIPTION_QWEN_LIVE_LANGUAGE?.trim() || undefined,
      model,
      provider: "qwen",
      track: input.track,
    };
    if (
      threshold !== undefined &&
      Number.isFinite(threshold) &&
      threshold >= -1 &&
      threshold <= 1
    ) {
      authorization.speechNoiseThreshold = threshold;
    }
    return authorization;
  }
}
