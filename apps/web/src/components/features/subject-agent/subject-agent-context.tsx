"use client";

import { Chat } from "@ai-sdk/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { DefaultChatTransport, safeValidateUIMessages } from "ai";
import type { UIMessage } from "ai";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { z } from "zod";
import type { CandidateFormAgentPageContext } from "@app/shared/candidate-form-agent";
import type { InterviewQuestionAgentPageContext } from "@app/shared/interview-question-agent";
import type { JobDescriptionAgentPageContext } from "@app/shared/job-description-agent";
import { useStudioSidePane } from "@/components/features/studio/studio-side-pane-context";
import {
  SUBJECT_THREAD_POLL_INTERVAL_MS,
  archiveSubjectThread,
  fetchActiveSubjectThread,
  fetchOlderSubjectThreadMessages,
  subjectThreadKeys,
  subjectThreadMessagesUrl,
} from "./subject-thread-api";
import type { SubjectRef } from "./subject-thread-api";

export const SUBJECT_AGENT_PANE_ID = "subject-agent";

interface FormBridgeOf<Kind extends string, Context> {
  getPageContext: () => Context;
  /** 最近一次保存的内容；新建页尚未保存时为 null。 */
  getSavedContext: () => Context | null;
  kind: Kind;
  /** 表单内容或保存版本变化时通知，用于补丁卡片实时判断状态。 */
  subscribe: (listener: () => void) => () => void;
  write: (values: Partial<Context>) => void;
}

/** TanStack Form store 的订阅接口（subscribe 返回 { unsubscribe }）。 */
interface SubscribableStore {
  subscribe: (listener: () => void) => { unsubscribe: () => void };
}

/** 把表单 store 的订阅转换成桥接口需要的“返回取消函数”形式。 */
export function subscribeToFormStore(store: SubscribableStore, listener: () => void): () => void {
  const subscription = store.subscribe(() => listener());
  return () => subscription.unsubscribe();
}

/** 页面表单向助手暴露的读写接口；助手只写入未保存的表单，保存仍走页面的“保存”。 */
export type SubjectAgentFormBridge =
  | FormBridgeOf<"candidate_form_template", CandidateFormAgentPageContext>
  | FormBridgeOf<"interview_question_template", InterviewQuestionAgentPageContext>
  | FormBridgeOf<"job_description", JobDescriptionAgentPageContext>;

const responseErrorSchema = z.object({
  error: z.string().optional(),
  message: z.string().optional(),
});

async function readResponseError(response: Response): Promise<string> {
  const parsed = responseErrorSchema.safeParse(await response.json().catch(() => null));
  return (parsed.success && (parsed.data.error ?? parsed.data.message)) || "发送失败，请稍后重试。";
}

async function toUiMessages(messages: readonly object[]): Promise<UIMessage[]> {
  if (messages.length === 0) {
    return [];
  }
  const validated = await safeValidateUIMessages<UIMessage>({ messages: [...messages] });
  if (!validated.success) {
    throw new Error("会话消息格式无效。", { cause: validated.error });
  }
  return validated.data;
}

function mergeMessages(older: UIMessage[], latest: UIMessage[]): UIMessage[] {
  const latestIds = new Set(latest.map((message) => message.id));
  return [...older.filter((message) => !latestIds.has(message.id)), ...latest];
}

function isChatBusy(status: Chat<UIMessage>["status"]): boolean {
  return status === "submitted" || status === "streaming";
}

async function loadActiveThread(ref: SubjectRef) {
  const data = await fetchActiveSubjectThread(ref);
  return { ...data, messages: await toUiMessages(data.messages) };
}

export type SubjectThreadState = Awaited<ReturnType<typeof loadActiveThread>>;
type SubjectPageContext = ReturnType<SubjectAgentFormBridge["getPageContext"]>;

/** 会话的共享 Chat 实例；只提交本条用户消息和当前表单，历史以服务端为准（ADR-0045）。 */
function createSubjectThreadChat({
  getPageContext,
  onSettled,
  subject,
}: {
  getPageContext: () => SubjectPageContext | null;
  onSettled: (error: Error | null) => void;
  subject: SubjectRef;
}): Chat<UIMessage> {
  return new Chat<UIMessage>({
    id: `subject-thread:${subject.kind}:${subject.subjectId}`,
    onError: (error) => onSettled(error),
    onFinish: () => onSettled(null),
    transport: new DefaultChatTransport<UIMessage>({
      api: subjectThreadMessagesUrl(subject),
      fetch: async (input, init) => {
        const response = await fetch(input, init);
        if (!response.ok) {
          throw new Error(await readResponseError(response));
        }
        return response;
      },
      prepareSendMessagesRequest: ({ messages }) => ({
        body: { message: messages.at(-1), pageContext: getPageContext() },
      }),
    }),
  });
}

function replaceChatMessages(chat: Chat<UIMessage>, messages: UIMessage[]) {
  chat.messages = messages;
}

interface SubjectAgentContextValue {
  /** 本页已应用的补丁及其撤销操作；只在当前页面有效，不持久化、不共享。 */
  appliedPatches: ReadonlyMap<string, () => void>;
  chat: Chat<UIMessage>;
  chatStatus: Chat<UIMessage>["status"];
  clearAppliedPatch: (toolCallId: string) => void;
  /** 当前登记的表单；未登记时为 null。 */
  formBridge: SubjectAgentFormBridge | null;
  getFormBridge: () => SubjectAgentFormBridge | null;
  hasOlderMessages: boolean;
  isLoadingOlder: boolean;
  loadOlderMessages: () => Promise<void>;
  markPatchApplied: (toolCallId: string, undo: () => void) => void;
  refreshThread: () => Promise<void>;
  registerFormBridge: (bridge: SubjectAgentFormBridge) => () => void;
  startNewConversation: () => Promise<void>;
  subject: SubjectRef;
  thread: UseQueryResult<SubjectThreadState>;
}

const SubjectAgentContext = createContext<SubjectAgentContextValue | null>(null);

export function SubjectAgentProvider({
  children,
  subject,
}: {
  children: ReactNode;
  subject: SubjectRef;
}) {
  const queryClient = useQueryClient();
  const pane = useStudioSidePane(SUBJECT_AGENT_PANE_ID);
  const formBridgeRef = useRef<SubjectAgentFormBridge | null>(null);
  // 同时保存在 state 中，让补丁卡片在表单登记后重新订阅。
  const [formBridge, setFormBridge] = useState<SubjectAgentFormBridge | null>(null);
  const activeKey = subjectThreadKeys.active(subject);
  const [older, setOlder] = useState<{ hasMore: boolean | null; messages: UIMessage[] }>({
    hasMore: null,
    messages: [],
  });
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [appliedPatches, setAppliedPatches] = useState<ReadonlyMap<string, () => void>>(
    () => new Map(),
  );

  const getPageContext = useCallback(() => formBridgeRef.current?.getPageContext() ?? null, []);
  // oxlint-disable-next-line react/refs -- The transport reads the form bridge only when a message is sent.
  const [chat] = useState(() =>
    createSubjectThreadChat({
      getPageContext,
      onSettled: (error) => {
        if (error) {
          toast.error(error.message);
        }
        void queryClient.invalidateQueries({ queryKey: subjectThreadKeys.active(subject) });
      },
      subject,
    }),
  );
  const chatStatus = useSyncExternalStore(
    (onChange) => chat["~registerStatusCallback"](onChange),
    () => chat.status,
    () => chat.status,
  );

  const thread = useQuery({
    enabled: pane.isOpen,
    queryFn: () => loadActiveThread(subject),
    queryKey: activeKey,
    refetchInterval:
      pane.isOpen && !isChatBusy(chatStatus) ? SUBJECT_THREAD_POLL_INTERVAL_MS : false,
  });

  // 服务端是会话的唯一来源：本人没有在生成时，用服务端消息替换本地消息。
  useEffect(() => {
    if (!thread.data || isChatBusy(chat.status)) {
      return;
    }
    replaceChatMessages(chat, mergeMessages(older.messages, thread.data.messages));
  }, [chat, older.messages, thread.data]);

  // 离开页面时停止本人的生成；服务端会保存已生成的部分并释放生成锁。
  useEffect(
    () => () => {
      void chat.stop();
    },
    [chat],
  );

  const loadOlderMessages = useCallback(async () => {
    const [first] = chat.messages;
    if (!first || isLoadingOlder) {
      return;
    }
    setIsLoadingOlder(true);
    try {
      const page = await fetchOlderSubjectThreadMessages(subject, first.id);
      const messages = await toUiMessages(page.messages);
      setOlder((previous) => ({
        hasMore: page.hasMore,
        messages: mergeMessages(messages, previous.messages),
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载更早的消息失败");
    } finally {
      setIsLoadingOlder(false);
    }
  }, [chat, isLoadingOlder, subject]);

  const resetLocalThread = useCallback(() => {
    setOlder({ hasMore: null, messages: [] });
    setAppliedPatches(new Map());
    replaceChatMessages(chat, []);
  }, [chat]);

  const refreshThread = useCallback(async () => {
    resetLocalThread();
    await queryClient.invalidateQueries({ queryKey: subjectThreadKeys.all(subject) });
  }, [queryClient, resetLocalThread, subject]);

  const startNewConversation = useCallback(async () => {
    await archiveSubjectThread(subject);
    await refreshThread();
  }, [refreshThread, subject]);

  const registerFormBridge = useCallback((bridge: SubjectAgentFormBridge) => {
    formBridgeRef.current = bridge;
    setFormBridge(bridge);
    return () => {
      if (formBridgeRef.current === bridge) {
        formBridgeRef.current = null;
        setFormBridge(null);
      }
    };
  }, []);

  const markPatchApplied = useCallback((toolCallId: string, undo: () => void) => {
    setAppliedPatches((current) => new Map(current).set(toolCallId, undo));
  }, []);
  const clearAppliedPatch = useCallback((toolCallId: string) => {
    setAppliedPatches((current) => {
      const next = new Map(current);
      next.delete(toolCallId);
      return next;
    });
  }, []);

  const hasOlderMessages = older.hasMore ?? thread.data?.hasMore ?? false;
  const value = useMemo<SubjectAgentContextValue>(
    () => ({
      appliedPatches,
      chat,
      chatStatus,
      clearAppliedPatch,
      formBridge,
      getFormBridge: () => formBridgeRef.current,
      hasOlderMessages,
      isLoadingOlder,
      loadOlderMessages,
      markPatchApplied,
      refreshThread,
      registerFormBridge,
      startNewConversation,
      subject,
      thread,
    }),
    [
      appliedPatches,
      chat,
      chatStatus,
      clearAppliedPatch,
      formBridge,
      hasOlderMessages,
      isLoadingOlder,
      loadOlderMessages,
      markPatchApplied,
      refreshThread,
      registerFormBridge,
      startNewConversation,
      subject,
      thread,
    ],
  );

  return <SubjectAgentContext.Provider value={value}>{children}</SubjectAgentContext.Provider>;
}

export function useSubjectAgent() {
  const context = useContext(SubjectAgentContext);
  if (!context) {
    throw new Error("useSubjectAgent requires SubjectAgentProvider");
  }
  return context;
}

/** 页面表单在 Provider 内登记读写接口；不在 Provider 内时（如弹窗编辑）为空操作。 */
export function useRegisterSubjectAgentForm(bridge: SubjectAgentFormBridge) {
  const register = useContext(SubjectAgentContext)?.registerFormBridge;
  useEffect(() => register?.(bridge), [bridge, register]);
}
