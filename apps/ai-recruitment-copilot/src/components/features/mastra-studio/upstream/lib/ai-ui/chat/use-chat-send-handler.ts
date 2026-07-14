import type { MastraDBMessage } from "@mastra/core/agent/message-list";
import { RequestContext } from "@mastra/core/di";
import type { TracingOptions } from "@mastra/core/observability";
import { memoryStatusQueryKey } from "@mastra/playground-ui/domains/memory/hooks/use-memory-status";
import { memoryThreadMessagesQueryKey } from "@mastra/playground-ui/domains/memory/hooks/use-memory-thread-messages";
import { observationalMemoryQueryKey } from "@mastra/playground-ui/domains/memory/hooks/use-observational-memory";
import type { useChat } from "@mastra/react";
import { useMastraClient } from "@mastra/react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { ChatSendArgs } from "./chat-context";
import type { OmProgressData } from "@/components/features/mastra-studio/upstream/domains/agents/context/agent-observational-memory-context";
import { injectBufferingEnds } from "@/components/features/mastra-studio/upstream/services/om-parts-converter";
import {
  buildMaxStepsStreamErrorMessage,
  buildStreamErrorMessage,
  isMaxStepsFinishChunk,
} from "@/components/features/mastra-studio/upstream/services/stream-error-message";

/**
 * The OM/error stream chunks this hook reacts to are not part of the typed
 * `useChat` chunk union, so we narrow them at the stream boundary.
 */
type OmStreamChunk =
  | { type: "data-om-observation-start"; data?: { operationType?: string } }
  | { type: "data-om-observation-end"; data?: { operationType?: string } }
  | { type: "data-om-observation-failed"; data?: { operationType?: string } }
  | {
      type: "data-om-status";
      data?: {
        windows: OmProgressData["windows"];
        recordId: string;
        threadId: string;
        stepNumber: number;
        generationCount: number;
      };
    }
  | { type: "data-om-activation"; data?: { operationType?: string; cycleId?: string } };

interface ErrorStreamChunk {
  type: "error";
  runId?: string;
  payload?: { error?: unknown };
}
type HandledStreamChunk = OmStreamChunk | ErrorStreamChunk;

const asHandledStreamChunk = (chunk: unknown): HandledStreamChunk | undefined => {
  const { type } = chunk as { type?: unknown };
  if (
    type === "error" ||
    type === "data-om-observation-start" ||
    type === "data-om-observation-end" ||
    type === "data-om-observation-failed" ||
    type === "data-om-status" ||
    type === "data-om-activation"
  ) {
    return chunk as HandledStreamChunk;
  }
  return undefined;
};

interface SendDeps {
  requestContext?: Record<string, unknown>;
  agentVersionId?: string;
  threadId?: string;
  modelSettingsArgs: Record<string, unknown>;
  chatWithNetwork?: boolean;
  chatWithGenerate?: boolean;
  maxSteps?: number;
  isOMEnabled: boolean;
  tracingOptions?: TracingOptions;
}

interface UseChatSendHandlerArgs {
  agentId: string;
  requestContext?: Record<string, unknown>;
  agentVersionId?: string;
  threadId?: string;
  modelSettingsArgs: Record<string, unknown>;
  chatWithNetwork?: boolean;
  chatWithGenerate?: boolean;
  maxSteps?: number;
  isOMEnabled: boolean;
  tracingOptions?: TracingOptions;
  threadSignalsUnsupportedRef: { current: boolean };
  isRunningStream: boolean;
  sendMessage: ReturnType<typeof useChat>["sendMessage"];
  cancelRun?: () => void;
  setMessages: Dispatch<SetStateAction<MastraDBMessage[]>>;
  setStreamErrors: Dispatch<SetStateAction<MastraDBMessage[]>>;
  refreshThreadList?: () => unknown;
  refreshWorkingMemory?: () => unknown;
  handleObservationStart: (operationType?: string) => void;
  handleProgressUpdate: (data: Extract<OmStreamChunk, { type: "data-om-status" }>["data"]) => void;
  refreshObservationalMemory: (operationType?: string) => void;
  handleActivation: (data: Extract<OmStreamChunk, { type: "data-om-activation" }>["data"]) => void;
  resetObservationalMemoryStreamState: () => void;
  /** Signal the memory timeline panel to refetch (mirrors left OM sidebar freshness). */
  signalTimelineRefresh: () => void;
}

const buildRequestContext = (deps: SendDeps) => {
  const requestContextInstance = new RequestContext();
  for (const [key, value] of Object.entries(deps.requestContext ?? {})) {
    requestContextInstance.set(key, value);
  }
  if (deps.agentVersionId) {
    requestContextInstance.set("agentVersionId", deps.agentVersionId);
  }
  return requestContextInstance;
};

interface ToolStreamChunk {
  type?: string;
  payload?: {
    toolName?: string;
    result?: unknown;
  };
}

const didUpdateWorkingMemory = (value: unknown) => {
  const chunk = value as ToolStreamChunk;
  const result = chunk.payload?.result;
  return (
    (chunk.type === "tool-result" || chunk.type === "tool-execution-end") &&
    chunk.payload?.toolName === "updateWorkingMemory" &&
    typeof result === "object" &&
    result !== null &&
    "success" in result &&
    Boolean(result.success)
  );
};

export const useChatSendHandler = ({
  agentId,
  requestContext,
  agentVersionId,
  threadId,
  modelSettingsArgs,
  chatWithNetwork,
  chatWithGenerate,
  maxSteps,
  isOMEnabled,
  tracingOptions,
  threadSignalsUnsupportedRef,
  isRunningStream,
  sendMessage,
  cancelRun,
  setMessages,
  setStreamErrors,
  refreshThreadList,
  refreshWorkingMemory,
  handleObservationStart,
  handleProgressUpdate,
  refreshObservationalMemory,
  handleActivation,
  resetObservationalMemoryStreamState,
  signalTimelineRefresh,
}: UseChatSendHandlerArgs) => {
  const baseClient = useMastraClient();
  const queryClient = useQueryClient();
  const abortControllerRef = useRef<AbortController | null>(null);
  const sendDepsRef = useRef<SendDeps>({
    agentVersionId,
    chatWithGenerate,
    chatWithNetwork,
    isOMEnabled,
    maxSteps,
    modelSettingsArgs,
    requestContext,
    threadId,
    tracingOptions,
  });
  sendDepsRef.current = {
    agentVersionId,
    chatWithGenerate,
    chatWithNetwork,
    isOMEnabled,
    maxSteps,
    modelSettingsArgs,
    requestContext,
    threadId,
    tracingOptions,
  };

  // Force an immediate refetch of the memory timeline panel (playground-ui
  // ['memory', ...] keys), scoped to the given thread, so the panel shows live
  // data right away. Runs on every chat completion regardless of whether
  // observational memory is enabled, so the thread messages and memory status
  // shown in the panel are never stale after a stream finishes.
  const refreshTimelinePanel = useCallback(
    (currentThreadId?: string) => {
      if (!currentThreadId) {
        return;
      }
      void queryClient.refetchQueries({
        queryKey: observationalMemoryQueryKey(agentId, currentThreadId),
      });
      void queryClient.refetchQueries({ queryKey: memoryThreadMessagesQueryKey(currentThreadId) });
      void queryClient.refetchQueries({ queryKey: memoryStatusQueryKey(agentId, currentThreadId) });
      // Also poke the timeline panel directly. The panel resolves its own thread id
      // from the route, so it stays correct even for brand-new threads where
      // `deps.threadId` is still undefined at send time and the keyed refetch above
      // cannot target the real thread yet.
      signalTimelineRefresh();
    },
    [agentId, queryClient, signalTimelineRefresh],
  );

  const completeObservationalMemoryBuffering = useCallback(
    (currentThreadId?: string) => {
      if (!currentThreadId || !sendDepsRef.current.isOMEnabled) {
        return;
      }
      const finishBuffering = async () => {
        try {
          const result = await baseClient.awaitBufferStatus({
            agentId,
            resourceId: agentId,
            threadId: currentThreadId,
          });
          setMessages((prev) => injectBufferingEnds(prev, result?.record));
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["observational-memory", agentId] }),
            queryClient.invalidateQueries({ queryKey: ["memory-status", agentId] }),
          ]);
          // Refetch the panel again once buffering completes, so any records that
          // only landed after awaitBufferStatus resolved are reflected immediately.
          refreshTimelinePanel(currentThreadId);
        } catch {
          // Buffer completion is opportunistic; the next query refresh recovers it.
        }
      };
      void finishBuffering();
    },
    [agentId, baseClient, queryClient, refreshTimelinePanel, setMessages],
  );

  const handleHandledChunk = useCallback(
    (handled: HandledStreamChunk | undefined) => {
      if (handled?.type === "error") {
        setStreamErrors((prev) => [...prev, buildStreamErrorMessage(handled)]);
      }
      if (handled?.type === "data-om-observation-start") {
        handleObservationStart(handled.data?.operationType);
      }
      if (handled?.type === "data-om-status") {
        handleProgressUpdate(handled.data);
      }
      if (
        handled?.type === "data-om-observation-end" ||
        handled?.type === "data-om-observation-failed" ||
        handled?.type === "data-om-activation"
      ) {
        refreshObservationalMemory(handled.data?.operationType);
      }
      if (handled?.type === "data-om-activation") {
        handleActivation(handled.data);
      }
    },
    [
      handleActivation,
      handleObservationStart,
      handleProgressUpdate,
      refreshObservationalMemory,
      setStreamErrors,
    ],
  );

  const send = useCallback(
    async ({ message, attachments = [] }: ChatSendArgs) => {
      const deps = sendDepsRef.current;
      if (threadSignalsUnsupportedRef.current && (isRunningStream || abortControllerRef.current)) {
        return;
      }

      setStreamErrors([]);
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const requestContextInstance = buildRequestContext(deps);

      try {
        if (deps.chatWithNetwork) {
          await sendMessage({
            coreUserMessages: attachments,
            message,
            mode: "network",
            modelSettings: deps.modelSettingsArgs,
            onNetworkChunk: async (chunk) => {
              if (didUpdateWorkingMemory(chunk)) {
                void refreshWorkingMemory?.();
              }
              if (chunk.type === "network-execution-event-step-finish") {
                await refreshThreadList?.();
              }
              handleHandledChunk(asHandledStreamChunk(chunk));
            },
            requestContext: requestContextInstance,
            signal: controller.signal,
            threadId: deps.threadId,
            tracingOptions: deps.tracingOptions,
          });
        } else if (deps.chatWithGenerate) {
          await sendMessage({
            coreUserMessages: attachments,
            message,
            mode: "generate",
            modelSettings: deps.modelSettingsArgs,
            requestContext: requestContextInstance,
            signal: controller.signal,
            threadId: deps.threadId,
            tracingOptions: deps.tracingOptions,
          });
          await refreshThreadList?.();
          refreshTimelinePanel(deps.threadId);
          return;
        } else {
          await sendMessage({
            coreUserMessages: attachments,
            message,
            mode: "stream",
            modelSettings: deps.modelSettingsArgs,
            onChunk: async (chunk) => {
              if (chunk.type === "finish") {
                if (isMaxStepsFinishChunk(chunk)) {
                  setStreamErrors((prev) => [
                    ...prev,
                    buildMaxStepsStreamErrorMessage(chunk, deps.maxSteps),
                  ]);
                }
                await refreshThreadList?.();
              }
              if (didUpdateWorkingMemory(chunk)) {
                void refreshWorkingMemory?.();
              }
              handleHandledChunk(asHandledStreamChunk(chunk));
            },
            requestContext: requestContextInstance,
            signal: controller.signal,
            threadId: deps.threadId,
            tracingOptions: deps.tracingOptions,
          });

          refreshTimelinePanel(deps.threadId);
          completeObservationalMemoryBuffering(deps.threadId);
          return;
        }

        setTimeout(() => {
          void refreshThreadList?.();
        }, 500);
        refreshTimelinePanel(deps.threadId);
        completeObservationalMemoryBuffering(deps.threadId);
      } catch (error: unknown) {
        console.error("Error occurred in ChatProvider", error);
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        setStreamErrors((prev) => [
          ...prev,
          buildStreamErrorMessage({ payload: { error }, runId: "thrown" }),
        ]);
        resetObservationalMemoryStreamState();
      } finally {
        abortControllerRef.current = null;
      }
    },
    [
      completeObservationalMemoryBuffering,
      handleHandledChunk,
      isRunningStream,
      refreshThreadList,
      refreshTimelinePanel,
      refreshWorkingMemory,
      resetObservationalMemoryStreamState,
      sendMessage,
      setStreamErrors,
      threadSignalsUnsupportedRef,
    ],
  );

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    resetObservationalMemoryStreamState();
    cancelRun?.();
    completeObservationalMemoryBuffering(sendDepsRef.current.threadId);
  }, [cancelRun, completeObservationalMemoryBuffering, resetObservationalMemoryStreamState]);

  return { cancel, send };
};
