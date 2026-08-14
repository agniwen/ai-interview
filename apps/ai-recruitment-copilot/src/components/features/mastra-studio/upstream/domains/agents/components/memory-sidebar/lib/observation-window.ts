import type { GetObservationalMemoryResponse } from "@mastra/client-js";
import type { OmProgressData } from "@/components/features/mastra-studio/upstream/domains/agents/context/agent-observational-memory-context";
import { firstDefined } from "../../../utils/presence";

type ThresholdValue = number | { min: number; max: number };
type ObservationalMemoryRecord = NonNullable<GetObservationalMemoryResponse["record"]>;

/** Shape of the observational-memory block inside the agent memory config endpoint. */
export interface OmAgentConfig {
  messageTokens?: ThresholdValue;
  observationTokens?: ThresholdValue;
  observation?: { messageTokens?: ThresholdValue };
  reflection?: { observationTokens?: ThresholdValue };
}

/** Shape of the config stored on an OM record (set by the OM processor). */
interface OmRecordConfig {
  observation?: { messageTokens?: number };
  reflection?: { observationTokens?: number };
}

export interface ObservationWindowTokens {
  messageTokens: number;
  messageThreshold: number;
  observationTokens: number;
  observationThreshold: number;
}

function getLiveMessageThreshold(progress: OmProgressData | null | undefined) {
  return progress?.windows?.active?.messages?.threshold;
}

function getLiveObservationThreshold(progress: OmProgressData | null | undefined) {
  return progress?.windows?.active?.observations?.threshold;
}

function getLiveMessageTokens(progress: OmProgressData | null | undefined) {
  return progress?.windows?.active?.messages?.tokens;
}

function getLiveObservationTokens(progress: OmProgressData | null | undefined) {
  return progress?.windows?.active?.observations?.tokens;
}

export const getThresholdValue = (
  threshold: ThresholdValue | undefined,
  defaultValue: number,
): number => {
  if (!threshold) {
    return defaultValue;
  }
  if (typeof threshold === "number") {
    return threshold;
  }
  return threshold.max;
};

/**
 * Source-of-truth derivation for the OM window's message/observation token counts
 * and thresholds. Priority order mirrors the OM sidebar section exactly:
 *   stream progress > record (counts) / record config (thresholds) > agent config > defaults.
 *
 * Shared so the OM section and the timeline panel cannot drift.
 */
export function getObservationWindowTokens({
  record,
  liveProgress,
  agentConfig,
}: {
  record: ObservationalMemoryRecord | null | undefined;
  liveProgress: OmProgressData | null | undefined;
  agentConfig: OmAgentConfig | undefined;
}): ObservationWindowTokens {
  const recordConfig = record?.config as OmRecordConfig | undefined;

  const messageThreshold = firstDefined(
    getLiveMessageThreshold(liveProgress),
    recordConfig?.observation?.messageTokens,
    getThresholdValue(agentConfig?.messageTokens, 30_000),
  ) as number;

  const observationThreshold = firstDefined(
    getLiveObservationThreshold(liveProgress),
    recordConfig?.reflection?.observationTokens,
    getThresholdValue(agentConfig?.observationTokens, 40_000),
  ) as number;

  const messageTokens = firstDefined(
    getLiveMessageTokens(liveProgress),
    record?.pendingMessageTokens,
    0,
  ) as number;
  const observationTokens = firstDefined(
    getLiveObservationTokens(liveProgress),
    record?.observationTokenCount,
    0,
  ) as number;

  return { messageThreshold, messageTokens, observationThreshold, observationTokens };
}
