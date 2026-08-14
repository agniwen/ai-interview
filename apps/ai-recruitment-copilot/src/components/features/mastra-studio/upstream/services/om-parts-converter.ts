import type { MastraDBMessage } from "@mastra/core/agent/message-list";

import type { OmCycleParts, OmCycleViewModel, OmIndexablePart } from "./om-types";

/**
 * Converts a data-om-* part to dynamic-tool format so toAssistantUIMessage can transform it.
 * The ToolFallback component will detect the om-observation-* prefix and render ObservationMarkerBadge.
 *
 * Input: { type: 'data-om-observation-start', data: {...} }
 * Output: { type: 'dynamic-tool', toolCallId, toolName: 'om-observation-start', input: {...}, output: {...}, state: 'output-available' }
 */
const OM_TOOL_NAME = "mastra-memory-om-observation";

interface FlexiblePartData extends Record<string, unknown> {
  cycleId?: string;
  disconnectedAt?: string;
  operationType?: string;
}

interface FlexibleMessagePart extends Record<string, unknown> {
  args?: Record<string, unknown>;
  data?: FlexiblePartData;
  metadata?: Record<string, unknown> & { omData?: Record<string, unknown> };
  toolName?: string;
  type: string;
}

interface BufferRecord extends Record<string, unknown> {
  bufferedObservationChunks?: BufferRecord[];
  bufferedReflection?: unknown;
  bufferedReflectionInputTokens?: unknown;
  bufferedReflectionTokens?: unknown;
  cycleId?: string;
  extractedValues?: Record<string, unknown>;
  extractionFailures?: { error: string; slug: string }[];
  messageTokens?: unknown;
  observations?: unknown;
  tokenCount?: unknown;
}

function asFlexiblePart(part: unknown): FlexibleMessagePart {
  return part as FlexibleMessagePart;
}

const OM_TYPE_TO_KEY = {
  "data-om-activation": "activation",
  "data-om-buffering-end": "bufferingEnd",
  "data-om-buffering-failed": "bufferingFailed",
  "data-om-buffering-start": "bufferingStart",
  "data-om-observation-end": "end",
  "data-om-observation-failed": "failed",
  "data-om-observation-start": "start",
} as const satisfies Record<string, keyof OmCycleParts>;

/**
 * Index data-om-* parts by cycleId from an array of parts.
 * Merges into an existing map so it can be called across multiple messages.
 */
const indexOmPartsByCycleId = (
  parts: MastraDBMessage["content"]["parts"],
  target: Map<string, OmCycleParts>,
) => {
  for (const part of parts) {
    if (!(part.type in OM_TYPE_TO_KEY)) {
      continue;
    }
    const omPart = part as NonNullable<OmIndexablePart>;
    const cycleId = omPart.data?.cycleId;
    if (!cycleId) {
      continue;
    }

    const key = OM_TYPE_TO_KEY[omPart.type];
    const existing = target.get(cycleId) || {};
    // The discriminant `omPart.type` and `key` are paired in OM_TYPE_TO_KEY, so
    // the assignment is sound; TS cannot correlate the two unions on its own.
    (existing[key] as OmIndexablePart) = omPart;
    target.set(cycleId, existing);
  }
  return target;
};

/**
 * Build a global map of all OM cycle parts across all messages.
 * This gives each per-message converter the full picture of a cycle's state
 * (e.g., buffering-start on message A, activation on message B).
 */
export type OmTerminalExtractionCache = Map<
  string,
  Partial<
    Record<
      "end" | "failed" | "bufferingEnd" | "bufferingFailed",
      {
        extractedValues?: Record<string, unknown>;
        extractionFailures?: { slug: string; error: string }[];
      }
    >
  >
>;

const hasExtractedValues = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;

const hasExtractionFailures = (value: unknown): value is { slug: string; error: string }[] =>
  Array.isArray(value) && value.length > 0;

const getExtractionData = (data: unknown) => {
  const source = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  return {
    ...(hasExtractedValues(source.extractedValues)
      ? { extractedValues: source.extractedValues }
      : {}),
    ...(hasExtractionFailures(source.extractionFailures)
      ? { extractionFailures: source.extractionFailures }
      : {}),
  };
};

const hasExtractionData = (data: unknown) => Object.keys(getExtractionData(data)).length > 0;

const mergeCachedExtractionData = (part: OmIndexablePart | undefined, cachedData: unknown) => {
  if (!part?.data || !cachedData) {
    return part;
  }

  const currentExtractionData = getExtractionData(part.data);
  const cachedExtractionData = getExtractionData(cachedData);
  if (!Object.keys(cachedExtractionData).length) {
    return part;
  }

  const mergedExtractionData = {
    ...((currentExtractionData.extractedValues ?? cachedExtractionData.extractedValues)
      ? {
          extractedValues:
            currentExtractionData.extractedValues ?? cachedExtractionData.extractedValues,
        }
      : {}),
    ...((currentExtractionData.extractionFailures ?? cachedExtractionData.extractionFailures)
      ? {
          extractionFailures:
            currentExtractionData.extractionFailures ?? cachedExtractionData.extractionFailures,
        }
      : {}),
  };

  return {
    ...part,
    data: {
      ...part.data,
      ...mergedExtractionData,
    },
  } as OmIndexablePart;
};

export const retainOmTerminalExtractionData = (
  globalOmParts: Map<string, OmCycleParts>,
  cache: OmTerminalExtractionCache,
) => {
  for (const [cycleId, cycle] of globalOmParts) {
    const cached = cache.get(cycleId);
    if (cached) {
      cycle.end = mergeCachedExtractionData(cycle.end, cached.end) as typeof cycle.end;
      cycle.failed = mergeCachedExtractionData(cycle.failed, cached.failed) as typeof cycle.failed;
      cycle.bufferingEnd = mergeCachedExtractionData(
        cycle.bufferingEnd,
        cached.bufferingEnd,
      ) as typeof cycle.bufferingEnd;
      cycle.bufferingFailed = mergeCachedExtractionData(
        cycle.bufferingFailed,
        cached.bufferingFailed,
      ) as typeof cycle.bufferingFailed;
    }

    const nextCached = { ...cached };
    if (hasExtractionData(cycle.end?.data)) {
      nextCached.end = getExtractionData(cycle.end?.data);
    }
    if (hasExtractionData(cycle.failed?.data)) {
      nextCached.failed = getExtractionData(cycle.failed?.data);
    }
    if (hasExtractionData(cycle.bufferingEnd?.data)) {
      nextCached.bufferingEnd = getExtractionData(cycle.bufferingEnd?.data);
    }
    if (hasExtractionData(cycle.bufferingFailed?.data)) {
      nextCached.bufferingFailed = getExtractionData(cycle.bufferingFailed?.data);
    }

    if (Object.keys(nextCached).length > 0) {
      cache.set(cycleId, nextCached);
    }
  }

  return globalOmParts;
};

export const buildGlobalOmPartsByCycleId = (
  messages: MastraDBMessage[],
  extractionCache?: OmTerminalExtractionCache,
) => {
  const map = new Map<string, OmCycleParts>();
  for (const msg of messages) {
    const parts = msg?.content?.parts;
    if (!Array.isArray(parts)) {
      continue;
    }
    indexOmPartsByCycleId(parts, map);
  }
  return extractionCache ? retainOmTerminalExtractionData(map, extractionCache) : map;
};

const normalizeObservationCycle = (
  cycleId: string,
  cycle: OmCycleParts,
): OmCycleViewModel | undefined => {
  const startData = cycle.start?.data;
  if (!startData) {
    return undefined;
  }

  const endData = cycle.end?.data;
  const failedData = cycle.failed?.data;
  const isFailed = !!cycle.failed;
  const isComplete = !!cycle.end;
  const isDisconnected = !!startData.disconnectedAt || (isComplete && !!endData?.disconnectedAt);
  let status: OmCycleViewModel["status"] = "observing";
  if (isFailed) {
    status = "failed";
  } else if (isDisconnected) {
    status = "disconnected";
  } else if (isComplete) {
    status = "observed";
  }

  let state = "loading";
  if (isFailed) {
    state = "failed";
  } else if (isDisconnected) {
    state = "disconnected";
  } else if (isComplete) {
    state = "complete";
  }

  const omData = {
    ...startData,
    ...(isComplete ? endData : {}),
    ...(isFailed ? failedData : {}),
    _state: state,
  };

  return {
    cycleId,
    extractedValues: hasExtractedValues(omData.extractedValues)
      ? omData.extractedValues
      : undefined,
    extractionFailures: hasExtractionFailures(omData.extractionFailures)
      ? omData.extractionFailures
      : undefined,
    isLoading: status === "observing",
    observations: omData.observations,
    omData,
    operationType: omData.operationType,
    recordId: typeof omData.recordId === "string" ? omData.recordId : undefined,
    status,
  };
};

const normalizeBufferingCycle = (
  cycleId: string,
  cycle: OmCycleParts,
): OmCycleViewModel | undefined => {
  const startData = cycle.bufferingStart?.data;
  if (!startData) {
    return undefined;
  }

  const endData = cycle.bufferingEnd?.data;
  const failedData = cycle.bufferingFailed?.data;
  const activationData = cycle.activation?.data;
  const isFailed = !!cycle.bufferingFailed;
  const isActivated = !!cycle.activation;
  const isComplete = !!cycle.bufferingEnd;
  const isDisconnected = !!startData.disconnectedAt;
  let status: OmCycleViewModel["status"] = "buffering";
  if (isFailed) {
    status = "buffering-failed";
  } else if (isDisconnected) {
    status = "disconnected";
  } else if (isComplete) {
    status = "buffering-complete";
  } else if (isActivated) {
    status = "activated";
  }
  const omData: Record<string, unknown> = {
    ...startData,
    ...(isComplete ? endData : {}),
    ...(isFailed ? failedData : {}),
    ...(isActivated ? activationData : {}),
    _state: status,
  };

  if (!omData.tokensObserved && omData.tokensActivated) {
    omData.tokensObserved = omData.tokensActivated;
  }

  return {
    cycleId,
    extractedValues: hasExtractedValues(omData.extractedValues)
      ? omData.extractedValues
      : undefined,
    extractionFailures: hasExtractionFailures(omData.extractionFailures)
      ? omData.extractionFailures
      : undefined,
    isLoading: status === "buffering",
    observations: omData.observations,
    omData,
    operationType: omData.operationType,
    recordId: typeof omData.recordId === "string" ? omData.recordId : undefined,
    status,
  };
};

export const normalizeOmCycle = (
  cycleId: string,
  cycle: OmCycleParts,
  type: "observation" | "buffering",
): OmCycleViewModel | undefined =>
  type === "observation"
    ? normalizeObservationCycle(cycleId, cycle)
    : normalizeBufferingCycle(cycleId, cycle);

/**
 * Combines data-om-* parts in a message into single tool calls by cycleId.
 * - start marker creates a tool call in 'input-available' (loading) state
 * - end/failed marker with same cycleId updates it to 'output-available' (complete) state
 * If both start and end exist for the same cycleId, only the final state is kept.
 * The tool call is placed at the position of the START marker to preserve order.
 *
 * Note: cycleId is unique per observation cycle, while recordId is constant for the entire
 * memory record. Using cycleId ensures each observation cycle gets its own UI element.
 *
 * @param globalOmParts - Pre-built map of all OM cycle parts across ALL messages.
 *   This allows the converter to know the full state of a cycle even when its parts
 *   span multiple messages (e.g., buffering-start on msg A, activation on msg B).
 */
const toDynamicOmToolPart = (
  cycleId: string,
  type: "observation" | "buffering",
  viewModel: OmCycleViewModel,
) => {
  let outputStatus: string = viewModel.status;
  if (type === "observation") {
    outputStatus = "complete";
    if (viewModel.status === "failed") {
      outputStatus = "failed";
    } else if (viewModel.status === "disconnected") {
      outputStatus = "disconnected";
    }
  }

  return {
    input: viewModel.omData,
    output: viewModel.isLoading ? undefined : { omData: viewModel.omData, status: outputStatus },
    state: viewModel.isLoading ? "input-available" : "output-available",
    toolCallId: `om-${type}-${cycleId}`,
    toolName: OM_TOOL_NAME,
    type: "dynamic-tool",
  };
};

const hasTerminalPart = (cycle: OmCycleParts | undefined, type: "observation" | "buffering") =>
  type === "observation"
    ? !!cycle?.end || !!cycle?.failed
    : !!cycle?.bufferingEnd || !!cycle?.bufferingFailed;

const isTerminalPartForType = (partType: string, type: "observation" | "buffering") =>
  type === "observation"
    ? partType === "data-om-observation-end" || partType === "data-om-observation-failed"
    : partType === "data-om-buffering-end" ||
      partType === "data-om-buffering-failed" ||
      partType === "data-om-activation";

const convertStartPart = (
  cycleId: string,
  type: "observation" | "buffering",
  messageOmParts: Map<string, OmCycleParts>,
  globalOmParts: Map<string, OmCycleParts>,
) => {
  const messageCycle = messageOmParts.get(cycleId);
  if (!messageCycle) {
    return;
  }

  const globalCycle = globalOmParts.get(cycleId);
  const isolatedCycle =
    type === "observation"
      ? { start: messageCycle.start }
      : { bufferingStart: messageCycle.bufferingStart };
  const cycle = hasTerminalPart(globalCycle, type) ? (globalCycle ?? messageCycle) : isolatedCycle;
  const viewModel = normalizeOmCycle(cycleId, cycle, type);
  return viewModel ? toDynamicOmToolPart(cycleId, type, viewModel) : undefined;
};

const convertTerminalPart = (
  cycleId: string,
  partType: string,
  type: "observation" | "buffering",
  messageOmParts: Map<string, OmCycleParts>,
  globalOmParts: Map<string, OmCycleParts>,
) => {
  const messageCycle = messageOmParts.get(cycleId);
  const cycle = globalOmParts.get(cycleId);
  const hasStart =
    type === "observation"
      ? messageCycle?.start || cycle?.start
      : messageCycle?.bufferingStart || cycle?.bufferingStart;
  if (hasStart || !cycle) {
    return;
  }

  const activationAlreadyFinished =
    type === "buffering" &&
    partType === "data-om-activation" &&
    (messageCycle?.bufferingEnd || messageCycle?.bufferingFailed);
  if (activationAlreadyFinished) {
    return;
  }

  const viewModel = normalizeOmCycle(cycleId, cycle, type);
  return viewModel ? toDynamicOmToolPart(cycleId, type, viewModel) : undefined;
};

const convertOmPart = (
  part: MastraDBMessage["content"]["parts"][number],
  messageOmParts: Map<string, OmCycleParts>,
  globalOmParts: Map<string, OmCycleParts>,
) => {
  const cycleId = asFlexiblePart(part).data?.cycleId;
  const partType = part.type as string;

  if (partType === "data-om-observation-start" && typeof cycleId === "string") {
    return convertStartPart(cycleId, "observation", messageOmParts, globalOmParts);
  }
  if (partType === "data-om-buffering-start" && typeof cycleId === "string") {
    return convertStartPart(cycleId, "buffering", messageOmParts, globalOmParts);
  }
  if (typeof cycleId === "string" && isTerminalPartForType(partType, "observation")) {
    return convertTerminalPart(cycleId, partType, "observation", messageOmParts, globalOmParts);
  }
  if (typeof cycleId === "string" && isTerminalPartForType(partType, "buffering")) {
    return convertTerminalPart(cycleId, partType, "buffering", messageOmParts, globalOmParts);
  }
  return partType.startsWith("data-om-") ? undefined : part;
};

export const convertOmPartsInMastraMessage = (
  message: MastraDBMessage,
  globalOmParts: Map<string, OmCycleParts>,
): MastraDBMessage => {
  if (!message || !Array.isArray(message.content?.parts)) {
    return message;
  }

  const messageOmParts = indexOmPartsByCycleId(
    message.content.parts,
    new Map<string, OmCycleParts>(),
  );
  const convertedParts: unknown[] = [];

  for (const part of message.content.parts) {
    const convertedPart = convertOmPart(part, messageOmParts, globalOmParts);
    if (convertedPart) {
      convertedParts.push(convertedPart);
    }
  }

  return {
    ...message,
    content: {
      ...message.content,
      parts: convertedParts as MastraDBMessage["content"]["parts"],
    },
  };
};

// -----------------------------------------------------------------------------
// Reload / interruption helpers for OM badges.
//
// `useChat` returns canonical `MastraDBMessage`s, where parts live at
// `message.content.parts` (and `content` is an object, not an array). These
// helpers therefore read/write `content.parts` directly. They are typed against
// `MastraDBMessage[]` on purpose: the previous in-provider versions were typed
// `any[]` and silently no-oped on the nested shape.
// -----------------------------------------------------------------------------

const mapAssistantParts = (
  messages: MastraDBMessage[],
  mapParts: (parts: FlexibleMessagePart[]) => {
    parts: FlexibleMessagePart[];
    changed: boolean;
  },
): MastraDBMessage[] =>
  messages.map((msg) => {
    if (msg.role !== "assistant") {
      return msg;
    }
    const parts = msg.content?.parts;
    if (!Array.isArray(parts)) {
      return msg;
    }

    const { parts: nextParts, changed } = mapParts(parts.map(asFlexiblePart));
    if (!changed) {
      return msg;
    }

    return {
      ...msg,
      content: { ...msg.content, parts: nextParts as MastraDBMessage["content"]["parts"] },
    };
  });

const collectTerminalCycleIds = (messages: MastraDBMessage[]) => {
  const observation = new Set<string>();
  const buffering = new Set<string>();
  const activatedBuffering = new Set<string>();

  for (const msg of messages) {
    const parts = msg.content?.parts;
    if (!Array.isArray(parts)) {
      continue;
    }

    for (const rawPart of parts) {
      const part = asFlexiblePart(rawPart);
      const cycleId = part?.data?.cycleId;
      if (!cycleId) {
        continue;
      }

      if (part.type === "data-om-observation-end" || part.type === "data-om-observation-failed") {
        observation.add(cycleId);
      }

      if (part.type === "data-om-buffering-end" || part.type === "data-om-buffering-failed") {
        buffering.add(cycleId);
      }

      if (part.type === "data-om-activation") {
        activatedBuffering.add(cycleId);
      }
    }
  }

  return { activatedBuffering, buffering, observation };
};

function disconnectStartPart(
  part: FlexibleMessagePart,
  terminalCycleIds: Set<string>,
): { changed: boolean; part: FlexibleMessagePart } {
  const cycleId = part.data?.cycleId;
  if (typeof cycleId !== "string" || part.data?.disconnectedAt || terminalCycleIds.has(cycleId)) {
    return { changed: false, part };
  }

  return {
    changed: true,
    part: {
      ...part,
      data: { ...part.data, _state: "disconnected", disconnectedAt: new Date().toISOString() },
    },
  };
}

function disconnectToolPart(part: FlexibleMessagePart): {
  changed: boolean;
  part: FlexibleMessagePart;
} {
  if (part.type !== "tool-call" || part.toolName !== OM_TOOL_NAME) {
    return { changed: false, part };
  }

  const omData = part.metadata?.omData || part.args;
  if (omData?.completedAt || omData?.failedAt || omData?.disconnectedAt) {
    return { changed: false, part };
  }

  return {
    changed: true,
    part: {
      ...part,
      metadata: {
        ...part.metadata,
        omData: { ...omData, _state: "disconnected", disconnectedAt: new Date().toISOString() },
      },
    },
  };
}

/**
 * Mark in-progress OM markers as disconnected when a stream is interrupted
 * (user cancel, network error, process exit). Preserves the original part type so
 * the badge stays anchored, only adding disconnection metadata to the data payload.
 */
export const markOmMarkersAsDisconnected = (messages: MastraDBMessage[]): MastraDBMessage[] => {
  const terminalCycleIds = collectTerminalCycleIds(messages);
  const disconnectedBufferingCycleIds = new Set([
    ...terminalCycleIds.buffering,
    ...terminalCycleIds.activatedBuffering,
  ]);

  return mapAssistantParts(messages, (parts) => {
    let changed = false;
    const nextParts = parts.map((part) => {
      let result: { changed: boolean; part: FlexibleMessagePart };
      if (part.type === "data-om-observation-start") {
        result = disconnectStartPart(part, terminalCycleIds.observation);
      } else if (part.type === "data-om-buffering-start") {
        result = disconnectStartPart(part, disconnectedBufferingCycleIds);
      } else {
        result = disconnectToolPart(part);
      }
      changed ||= result.changed;
      return result.part;
    });
    return { changed, parts: nextParts };
  });
};

/**
 * Inject synthetic `data-om-buffering-end` parts after buffer-status resolves so
 * `convertOmPartsInMastraMessage` sees a matching end for each in-progress start.
 * Uses the record from `awaitBufferStatus` to populate token counts/observations.
 */
export const hasInProgressBufferingMarkers = (messages: MastraDBMessage[]) => {
  const { buffering, activatedBuffering } = collectTerminalCycleIds(messages);
  const terminalCycleIds = new Set([...buffering, ...activatedBuffering]);

  for (const msg of messages) {
    const parts = msg.content?.parts;
    if (!Array.isArray(parts)) {
      continue;
    }

    for (const rawPart of parts) {
      const part = asFlexiblePart(rawPart);
      const cycleId = part?.data?.cycleId;
      if (
        part.type === "data-om-buffering-start" &&
        cycleId &&
        !part.data?.disconnectedAt &&
        !terminalCycleIds.has(cycleId)
      ) {
        return true;
      }

      if (
        part.type === "data-om-buffering-end" &&
        cycleId &&
        part.data?.operationType === "observation" &&
        !hasExtractionData(part.data)
      ) {
        return true;
      }
    }
  }

  return false;
};

export const injectBufferingEnds = (
  messages: MastraDBMessage[],
  record?: BufferRecord | null,
): MastraDBMessage[] => {
  const chunksByCycleId = new Map<string, BufferRecord>();
  const terminalCycleIds = collectTerminalCycleIds(messages).buffering;

  if (record?.bufferedObservationChunks) {
    for (const chunk of record.bufferedObservationChunks) {
      if (chunk.cycleId) {
        chunksByCycleId.set(chunk.cycleId, chunk);
      }
    }
  }

  return mapAssistantParts(messages, (parts) => {
    const newParts: FlexibleMessagePart[] = [];
    let changed = false;

    for (const part of parts) {
      if (
        part.type === "data-om-buffering-end" &&
        part.data?.cycleId &&
        part.data?.operationType === "observation"
      ) {
        const chunk = chunksByCycleId.get(part.data.cycleId);
        if (chunk && !hasExtractionData(part.data)) {
          newParts.push({
            ...part,
            data: {
              ...part.data,
              extractedValues: chunk.extractedValues,
              extractionFailures: chunk.extractionFailures,
              observations: part.data.observations ?? chunk.observations,
            },
          });
          changed = true;
          continue;
        }
      }

      newParts.push(part);
      if (
        part.type === "data-om-buffering-start" &&
        part.data?.cycleId &&
        !part.data?.disconnectedAt &&
        !terminalCycleIds.has(part.data.cycleId)
      ) {
        const { cycleId } = part.data;
        const opType = part.data.operationType;

        const endData: Record<string, unknown> = {
          completedAt: new Date().toISOString(),
          cycleId,
          operationType: opType,
        };

        if (opType === "observation") {
          const chunk = chunksByCycleId.get(cycleId);
          if (chunk) {
            endData.tokensBuffered = chunk.messageTokens;
            endData.bufferedTokens = chunk.tokenCount;
            endData.observations = chunk.observations;
            endData.extractedValues = chunk.extractedValues;
            endData.extractionFailures = chunk.extractionFailures;
          }
        } else if (opType === "reflection" && record) {
          endData.tokensBuffered = record.bufferedReflectionInputTokens;
          endData.bufferedTokens = record.bufferedReflectionTokens;
          endData.observations = record.bufferedReflection;
        }

        newParts.push({ data: endData, type: "data-om-buffering-end" });
        terminalCycleIds.add(cycleId);
        changed = true;
      }
    }

    return { changed, parts: newParts };
  });
};

/**
 * Scan persisted messages on initial load for OM activation markers and the last
 * progress part, so buffering badges show as activated and token counts are
 * accurate after a reload.
 */
export const scanOmInitialState = (
  messages: MastraDBMessage[],
): { activatedCycleIds: string[]; lastProgress: Record<string, unknown> | null } => {
  const activatedCycleIds: string[] = [];
  let lastProgress: Record<string, unknown> | null = null;

  for (const msg of messages) {
    const parts = msg?.content?.parts;
    if (!Array.isArray(parts)) {
      continue;
    }
    for (const rawPart of parts) {
      const part = asFlexiblePart(rawPart);
      if (part?.type === "data-om-activation" && part?.data?.cycleId) {
        activatedCycleIds.push(part.data.cycleId);
      }
      if (part?.type === "data-om-status" && part?.data) {
        lastProgress = part.data;
      }
    }
  }

  return { activatedCycleIds, lastProgress };
};
