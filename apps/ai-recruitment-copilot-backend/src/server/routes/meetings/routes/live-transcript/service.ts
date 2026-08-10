import { createHash } from "node:crypto";
import type {
  MeetingLiveTranscriptAuthorization,
  MeetingLiveTranscriptTrack,
} from "@arc/shared/meeting-transcription";
import {
  ensureDefaultMeetingTranscriptionPolicy,
  loadMeetingTranscriptionPolicy,
} from "../../transcription/dao";
import { resolveMeetingTranscriptionQwenBaseUrl } from "../../transcription/provider-endpoint";
import { listMeetingTranscriptionProviderCandidates } from "../../transcription/provider-registry";
import { createOpenAiRealtimeTranscriptionAuthorization } from "../../transcription/providers/openai-realtime";
import {
  DEFAULT_MEETING_TRANSCRIPTION_QWEN_LIVE_MODEL,
  createQwenRealtimeTranscriptionAuthorization,
} from "../../transcription/providers/qwen-realtime";
import { liveTranscriptAuthorizationGate } from "./authorization-gate";
import {
  claimMeetingLiveTranscriptLease,
  releaseMeetingLiveTranscriptLease,
  releaseMeetingLiveTranscriptTrackLease,
  renewMeetingLiveTranscriptLease,
} from "./dao";

function issueLiveTranscriptLeaseAuthorization(
  input: {
    captureId: string;
    organizationId: string;
    track: MeetingLiveTranscriptTrack;
    userId: string;
  },
  mint: () => Promise<MeetingLiveTranscriptAuthorization>,
): Promise<MeetingLiveTranscriptAuthorization | "capacity"> {
  return liveTranscriptAuthorizationGate.issue(input, async () => {
    const claim = await claimMeetingLiveTranscriptLease(input);
    if (claim === "capacity") {
      return "capacity";
    }
    try {
      return await mint();
    } catch (error) {
      if (claim === "created") {
        try {
          await releaseMeetingLiveTranscriptTrackLease(input);
        } catch {
          // The short track lease expires server-side if cleanup cannot be delivered.
        }
      }
      throw error;
    }
  });
}

export async function createWorkspaceMeetingLiveTranscriptAuthorization(input: {
  captureId: string;
  organizationId: string;
  track: MeetingLiveTranscriptTrack;
  userId: string;
}): Promise<MeetingLiveTranscriptAuthorization | "capacity" | "unavailable"> {
  const providers = listMeetingTranscriptionProviderCandidates();
  let policy = await loadMeetingTranscriptionPolicy(input.organizationId);
  if (policy.revision === 0 && providers.some((provider) => provider.id === "qwen")) {
    // 未配置过转录策略的工作区物化部署默认（与最终转录任务路径一致），
    // 否则实时字幕会因 allowedProviders 为空而永远 503。
    // Materialize the deployment default like the final-transcription path does;
    // otherwise live captions 503 forever for unconfigured workspaces.
    await ensureDefaultMeetingTranscriptionPolicy(input.organizationId);
    policy = await loadMeetingTranscriptionPolicy(input.organizationId);
  }
  const openaiApiKey = process.env.OPENAI_API_KEY?.trim();
  if (
    policy.allowedProviders.includes("openai") &&
    providers.some((provider) => provider.id === "openai") &&
    openaiApiKey
  ) {
    return issueLiveTranscriptLeaseAuthorization(input, () =>
      createOpenAiRealtimeTranscriptionAuthorization(
        {
          captureId: input.captureId,
          safetyIdentifier: createHash("sha256")
            .update(`${input.organizationId}:${input.userId}`)
            .digest("hex"),
          track: input.track,
        },
        {
          apiKey: openaiApiKey,
          model:
            process.env.MEETING_TRANSCRIPTION_OPENAI_LIVE_MODEL?.trim() || "gpt-4o-mini-transcribe",
        },
      ),
    );
  }
  const qwenApiKey = process.env.ALIBABA_API_KEY?.trim();
  if (
    policy.allowedProviders.includes("qwen") &&
    providers.some((provider) => provider.id === "qwen") &&
    qwenApiKey
  ) {
    return issueLiveTranscriptLeaseAuthorization(input, () =>
      createQwenRealtimeTranscriptionAuthorization(
        {
          captureId: input.captureId,
          language: process.env.MEETING_TRANSCRIPTION_QWEN_LIVE_LANGUAGE?.trim() || undefined,
          track: input.track,
        },
        {
          apiKey: qwenApiKey,
          baseUrl: resolveMeetingTranscriptionQwenBaseUrl(),
          model:
            process.env.MEETING_TRANSCRIPTION_QWEN_LIVE_MODEL?.trim() ||
            DEFAULT_MEETING_TRANSCRIPTION_QWEN_LIVE_MODEL,
          tokenTtlSeconds: Number.parseInt(
            process.env.MEETING_TRANSCRIPTION_QWEN_LIVE_TOKEN_TTL_SECONDS || "1800",
            10,
          ),
        },
      ),
    );
  }
  return "unavailable";
}

export function heartbeatWorkspaceMeetingLiveTranscript(input: {
  captureId: string;
  organizationId: string;
  userId: string;
}): Promise<boolean> {
  return renewMeetingLiveTranscriptLease(input);
}

export function releaseWorkspaceMeetingLiveTranscript(input: {
  captureId: string;
  organizationId: string;
  userId: string;
}): Promise<void> {
  return releaseMeetingLiveTranscriptLease(input);
}
