import type { MastraDBMessage } from "@mastra/core/agent/message-list";
import { RequestContext } from "@mastra/core/di";
import { memoryStatusQueryKey } from "@mastra/playground-ui/domains/memory/hooks/use-memory-status";
import { memoryThreadMessagesQueryKey } from "@mastra/playground-ui/domains/memory/hooks/use-memory-thread-messages";
import { observationalMemoryQueryKey } from "@mastra/playground-ui/domains/memory/hooks/use-observational-memory";
import { useChat, useMastraClient } from "@mastra/react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import {
  ChatMessagesContext,
  ChatRunningContext,
  ChatSendContext,
  ChatTasksContext,
} from "./chat-context";
import type {
  MessagesContextValue,
  RunningContextValue,
  SendContextValue,
  TasksContextValue,
} from "./chat-context";
import { useChatSendHandler } from "./use-chat-send-handler";
import { useObservationalMemoryContext } from "@/components/features/mastra-studio/upstream/domains/agents/context/agent-observational-memory-context";
import type { OmProgressData } from "@/components/features/mastra-studio/upstream/domains/agents/context/agent-observational-memory-context";
import { useWorkingMemory } from "@/components/features/mastra-studio/upstream/domains/agents/context/agent-working-memory-context";
import { useMemoryConfig } from "@/components/features/mastra-studio/upstream/domains/memory/hooks/use-memory";
import { useTracingSettings } from "@/components/features/mastra-studio/upstream/domains/observability/context/tracing-settings-context";
import { getCanSendWhileStreaming } from "@/components/features/mastra-studio/upstream/services/mastra-runtime-state";
import {
  buildGlobalOmPartsByCycleId,
  convertOmPartsInMastraMessage,
  hasInProgressBufferingMarkers,
  injectBufferingEnds,
  markOmMarkersAsDisconnected,
  scanOmInitialState,
} from "@/components/features/mastra-studio/upstream/services/om-parts-converter";
import type { OmTerminalExtractionCache } from "@/components/features/mastra-studio/upstream/services/om-parts-converter";
import { ToolCallProvider } from "@/components/features/mastra-studio/upstream/services/tool-call-provider";
import type { ChatProps } from "@/components/features/mastra-studio/upstream/types";

/**
 * Runtime + dispatch context for the main agent chat.
 *
 * Replaces the assistant-ui `MastraRuntimeProvider` (`useExternalStoreRuntime`)
 * and `ToolCallProvider`. It drives `useChat` from `@mastra/react`, preserves the
 * full streaming / generate / network behaviour (OM lifecycle, working-memory
 * refresh, thread-list refresh, stream errors, approvals, cancel), and exposes a
 * plain-prop context consumed by `MessageRow`/`MessageFactory` and the composer.
 */
export function ChatProvider({
  children,
  agentId,
  initialMessages,
  threadId,
  refreshThreadList,
  settings,
  requestContext,
  modelVersion,
  agentVersionId,
  supportsMemory,
}: Readonly<{ children: ReactNode }> & ChatProps) {
  const { settings: tracingSettings } = useTracingSettings();

  // Errors emitted as `error` chunks (or thrown by sendMessage) are not persisted
  // to server memory, so they get wiped from useChat's `messages` state when
  // `initialMessages` refreshes after a stream ends. Track them in a parallel
  // state that survives those resets so the chat still surfaces the failure.
  const [streamErrors, setStreamErrors] = useState<MastraDBMessage[]>([]);
  const [threadSignalsUnsupported, setThreadSignalsUnsupported] = useState(false);
  const threadSignalsUnsupportedRef = useRef(false);
  const modelSettings = settings?.modelSettings ?? {};
  const threadSignalsEnabled =
    window.MASTRA_AGENT_SIGNALS !== "false" &&
    supportsMemory !== false &&
    !modelSettings.chatWithLegacyStream;

  // Clear persisted stream errors when switching threads/agents so they don't
  // leak across conversations.
  useEffect(() => {
    setStreamErrors([]);
    threadSignalsUnsupportedRef.current = false;
    setThreadSignalsUnsupported(false);
  }, [agentId, threadId]);

  const chatRequestContext = useMemo(() => {
    if (!agentVersionId && !requestContext) {
      return;
    }
    const ctx = new RequestContext();
    for (const [key, value] of Object.entries(requestContext ?? {})) {
      ctx.set(key, value);
    }
    if (agentVersionId) {
      ctx.set("agentVersionId", agentVersionId);
    }
    return ctx;
  }, [agentVersionId, requestContext]);

  const {
    messages,
    tasks,
    sendMessage,
    cancelRun,
    isRunning: isRunningStream,
    isAwaitingToolApproval,
    setMessages,
    approveToolCall,
    declineToolCall,
    approveToolCallGenerate,
    declineToolCallGenerate,
    toolCallApprovals,
    approveNetworkToolCall,
    declineNetworkToolCall,
    networkToolCallApprovals,
  } = useChat({
    agentId,
    enableThreadSignals: threadSignalsEnabled,
    initialMessages,
    onThreadSignalsUnsupported: () => {
      threadSignalsUnsupportedRef.current = true;
      setThreadSignalsUnsupported(true);
    },
    requestContext: chatRequestContext,
    threadId,
  });

  const { refetch: refreshWorkingMemory } = useWorkingMemory();
  const queryClient = useQueryClient();
  const baseClient = useMastraClient();

  const { data: memoryConfigData } = useMemoryConfig(agentId);
  const omConfig = memoryConfigData?.config?.observationalMemory as unknown;
  const isOMEnabled =
    omConfig === true ||
    (typeof omConfig === "object" &&
      omConfig !== null &&
      (!("enabled" in omConfig) || omConfig.enabled !== false));
  const {
    setIsObservingFromStream,
    setIsReflectingFromStream,
    signalObservationsUpdated,
    setStreamProgress,
    markCycleIdActivated,
  } = useObservationalMemoryContext();

  const handleObservationStart = useCallback(
    (operationType?: string) => {
      if (operationType === "reflection") {
        setIsReflectingFromStream(true);
      } else {
        setIsObservingFromStream(true);
      }
    },
    [setIsObservingFromStream, setIsReflectingFromStream],
  );

  const handleProgressUpdate = useCallback(
    (data: OmProgressData | undefined) => {
      if (!data || (data.threadId && data.threadId !== threadId)) {
        return;
      }
      setStreamProgress({
        generationCount: data.generationCount,
        recordId: data.recordId,
        stepNumber: data.stepNumber,
        threadId: data.threadId,
        windows: data.windows,
      });
    },
    [setStreamProgress, threadId],
  );

  const refreshObservationalMemory = useCallback(
    (operationType?: string) => {
      if (operationType === "reflection") {
        setIsReflectingFromStream(false);
      } else {
        setIsObservingFromStream(false);
      }
      signalObservationsUpdated();
      void queryClient.invalidateQueries({ queryKey: ["observational-memory", agentId] });
      void queryClient.invalidateQueries({ queryKey: ["memory-status", agentId] });
      // Force an immediate refetch of the memory timeline panel, which uses the
      // playground-ui hooks keyed under the ['memory', ...] prefix. Scope to the
      // active thread so unrelated memory caches and other threads are untouched,
      // and refetch (not just invalidate) so the panel shows live data right away.
      void queryClient.refetchQueries({ queryKey: observationalMemoryQueryKey(agentId, threadId) });
      void queryClient.refetchQueries({ queryKey: memoryThreadMessagesQueryKey(threadId) });
      void queryClient.refetchQueries({ queryKey: memoryStatusQueryKey(agentId, threadId) });
    },
    [
      agentId,
      queryClient,
      setIsObservingFromStream,
      setIsReflectingFromStream,
      signalObservationsUpdated,
      threadId,
    ],
  );

  const handleActivation = useCallback(
    (data: { cycleId?: string } | undefined) => {
      const cycleId = data?.cycleId;
      if (cycleId) {
        markCycleIdActivated(cycleId);
      }
    },
    [markCycleIdActivated],
  );

  const resetObservationalMemoryStreamState = useCallback(() => {
    setIsObservingFromStream(false);
    setIsReflectingFromStream(false);
    setMessages((prev) => markOmMarkersAsDisconnected(prev));
    void queryClient.invalidateQueries({ queryKey: ["observational-memory", agentId] });
    void queryClient.invalidateQueries({ queryKey: ["memory-status", agentId] });
    // Force an immediate refetch of the memory timeline panel on stream reset (see refreshObservationalMemory).
    void queryClient.refetchQueries({ queryKey: observationalMemoryQueryKey(agentId, threadId) });
    void queryClient.refetchQueries({ queryKey: memoryThreadMessagesQueryKey(threadId) });
    void queryClient.refetchQueries({ queryKey: memoryStatusQueryKey(agentId, threadId) });
  }, [
    agentId,
    queryClient,
    setIsObservingFromStream,
    setIsReflectingFromStream,
    setMessages,
    threadId,
  ]);

  // On initial load, scan messages for activation markers + last progress so
  // buffering badges show as activated and token counts are accurate on reload.
  useEffect(() => {
    const { activatedCycleIds, lastProgress } = scanOmInitialState(initialMessages || []);
    for (const cycleId of activatedCycleIds) {
      markCycleIdActivated(cycleId);
    }
    if (lastProgress) {
      handleProgressUpdate(lastProgress as unknown as OmProgressData);
    }
  }, [handleProgressUpdate, initialMessages, markCycleIdActivated]);

  useEffect(() => {
    if (!threadId || !hasInProgressBufferingMarkers(initialMessages || [])) {
      return;
    }

    let cancelled = false;
    const reconcileBuffering = async () => {
      try {
        const result = await baseClient.awaitBufferStatus({
          agentId,
          resourceId: agentId,
          threadId,
        });
        if (cancelled) {
          return;
        }
        setMessages((prev) => injectBufferingEnds(prev, result?.record));
      } catch {
        if (cancelled) {
          return;
        }
        setMessages((prev) => markOmMarkersAsDisconnected(prev));
      }
    };
    void reconcileBuffering();

    return () => {
      cancelled = true;
    };
  }, [agentId, baseClient, initialMessages, setMessages, threadId]);

  const {
    frequencyPenalty,
    presencePenalty,
    maxRetries,
    maxSteps,
    maxTokens,
    temperature,
    topK,
    topP,
    seed,
    chatWithGenerate,
    chatWithNetwork,
    chatWithLegacyStream,
    providerOptions,
    requireToolApproval,
  } = modelSettings;

  const modelSettingsArgs = {
    frequencyPenalty,
    maxRetries,
    maxSteps,
    maxTokens,
    presencePenalty,
    providerOptions,
    requireToolApproval,
    seed,
    temperature,
    topK,
    topP,
  };

  const { send, cancel } = useChatSendHandler({
    agentId,
    agentVersionId,
    cancelRun,
    chatWithGenerate,
    chatWithNetwork,
    handleActivation,
    handleObservationStart,
    handleProgressUpdate,
    isOMEnabled,
    isRunningStream,
    maxSteps,
    modelSettingsArgs,
    refreshObservationalMemory,
    refreshThreadList,
    refreshWorkingMemory,
    requestContext,
    resetObservationalMemoryStreamState,
    sendMessage,
    setMessages,
    setStreamErrors,
    signalTimelineRefresh: signalObservationsUpdated,
    threadId,
    threadSignalsUnsupportedRef,
    tracingOptions: tracingSettings?.tracingOptions,
  });

  const isSupportedModel = modelVersion === "v2" || modelVersion === "v3";

  // Build a global OM cycle index then convert OM parts to dynamic-tool form so
  // OM badges render. Strip transient error messages from `messages` (the same
  // errors live in `streamErrors`, which survives the post-stream refresh).
  const omTerminalExtractionCacheRef = useRef<OmTerminalExtractionCache>(new Map());
  const globalOmParts = useMemo(
    () => buildGlobalOmPartsByCycleId(messages, omTerminalExtractionCacheRef.current),
    [messages],
  );

  const renderMessages = useMemo<MastraDBMessage[]>(
    () =>
      [...messages.filter((msg) => msg.content?.metadata?.status !== "error"), ...streamErrors].map(
        (msg) => convertOmPartsInMastraMessage(msg, globalOmParts),
      ),
    [messages, streamErrors, globalOmParts],
  );

  const isRunning = isRunningStream || isAwaitingToolApproval;
  const usesSignalStreamTransport = !chatWithGenerate && !chatWithNetwork && !chatWithLegacyStream;
  const canSendWhileStreaming = getCanSendWhileStreaming({
    isSupportedModel,
    threadId,
    threadSignalsEnabled: threadSignalsEnabled && usesSignalStreamTransport,
    threadSignalsUnsupported,
  });

  const messagesValue = useMemo<MessagesContextValue>(
    () => ({ messages: renderMessages }),
    [renderMessages],
  );
  const runningValue = useMemo<RunningContextValue>(
    () => ({ canSendWhileStreaming, cancelRun: cancel, isRunning }),
    [isRunning, cancel, canSendWhileStreaming],
  );
  const sendValue = useMemo<SendContextValue>(() => ({ send }), [send]);
  const tasksValue = useMemo<TasksContextValue>(() => ({ tasks }), [tasks]);

  return (
    <ChatRunningContext.Provider value={runningValue}>
      <ChatMessagesContext.Provider value={messagesValue}>
        <ChatTasksContext.Provider value={tasksValue}>
          <ChatSendContext.Provider value={sendValue}>
            <ToolCallProvider
              approveToolcall={approveToolCall}
              declineToolcall={declineToolCall}
              approveToolcallGenerate={approveToolCallGenerate}
              declineToolcallGenerate={declineToolCallGenerate}
              approveNetworkToolcall={approveNetworkToolCall}
              declineNetworkToolcall={declineNetworkToolCall}
              isRunning={isRunningStream}
              toolCallApprovals={toolCallApprovals}
              networkToolCallApprovals={networkToolCallApprovals}
            >
              {children}
            </ToolCallProvider>
          </ChatSendContext.Provider>
        </ChatTasksContext.Provider>
      </ChatMessagesContext.Provider>
    </ChatRunningContext.Provider>
  );
}
