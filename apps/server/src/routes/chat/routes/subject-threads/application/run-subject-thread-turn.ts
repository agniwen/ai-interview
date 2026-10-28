import type { ModelMessage, UIMessage } from "ai";
import { convertToModelMessages, createUIMessageStream, safeValidateUIMessages } from "ai";
import { toAISdkStream } from "@mastra/ai-sdk";
import type { ArcMessage } from "@app/db-schema/ai-message";
import type { JsonValue } from "@app/shared/stable-stringify";
import type { SubjectRef, SubjectThreadRow } from "../dao";
import type { SubjectThreadAgentSetup } from "../subjects";

export interface RunSubjectThreadTurnDependencies {
  claimRun: (
    conversationId: string,
    runState: { runId: string; startedAt: string; userId: string },
  ) => Promise<boolean>;
  createAgent: (pageContext: JsonValue | null) => SubjectThreadAgentSetup;
  ensureThread: (
    ref: SubjectRef,
    input: { createdByUserId: string; title: string },
  ) => Promise<SubjectThreadRow>;
  loadHistory: (conversationId: string) => Promise<ArcMessage[]>;
  loadThread: (ref: SubjectRef, conversationId: string) => Promise<SubjectThreadRow | null>;
  releaseRun: (conversationId: string, runId: string) => Promise<void>;
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- error reporters receive arbitrary thrown values by contract.
  reportError: (error: unknown, operation: string) => void;
  saveMessage: (input: {
    authorUserId: string | null;
    conversationId: string;
    message: ArcMessage;
    organizationId: string;
  }) => Promise<void>;
  toArcMessage: (message: UIMessage) => ArcMessage;
}

export type RunSubjectThreadTurnResult =
  | { kind: "busy"; runningUserId: string | null }
  | { kind: "invalid_message" }
  | { conversationId: string; kind: "stream"; stream: ReadableStream };

const AGENT_UNAVAILABLE_MESSAGE = "岗位助手暂时无法响应，请稍后重试。";

function messageText(message: UIMessage): string {
  return message.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join(" ")
    .trim();
}

async function toModelHistory(history: ArcMessage[]): Promise<ModelMessage[]> {
  const conversational = history.filter(
    (message) => message.role === "user" || message.role === "assistant",
  );
  const validated = await safeValidateUIMessages<UIMessage>({ messages: conversational });
  if (!validated.success) {
    throw new Error("Stored subject thread history is not a valid UI message list.", {
      cause: validated.error,
    });
  }
  return await convertToModelMessages(validated.data);
}

/**
 * 在实体会话中执行一轮对话：懒创建活动会话、占用生成锁、保存本条消息、以服务端历史
 * 组装模型输入，并在流结束（含客户端中断）时保存回复、释放锁。
 * Runs one Subject Thread turn: lazily create the active thread, claim the run lock, persist the
 * user message, build model input from stored history, then persist the reply and release the
 * lock when the stream ends, including client cancellation.
 */
export async function runSubjectThreadTurn(
  input: {
    actorUserId: string;
    message: unknown;
    pageContext: JsonValue | null;
    ref: SubjectRef;
    signal: AbortSignal;
  },
  deps: RunSubjectThreadTurnDependencies,
): Promise<RunSubjectThreadTurnResult> {
  const validated = await safeValidateUIMessages<UIMessage>({ messages: [input.message] });
  const [userMessage] = validated.success ? validated.data : [];
  if (!userMessage || userMessage.role !== "user" || messageText(userMessage) === "") {
    return { kind: "invalid_message" };
  }

  const thread = await deps.ensureThread(input.ref, {
    createdByUserId: input.actorUserId,
    title: messageText(userMessage),
  });
  const runId = crypto.randomUUID();
  const claimed = await deps.claimRun(thread.id, {
    runId,
    startedAt: new Date().toISOString(),
    userId: input.actorUserId,
  });
  if (!claimed) {
    const current = await deps.loadThread(input.ref, thread.id);
    return { kind: "busy", runningUserId: current?.runState?.userId ?? null };
  }

  let released = false;
  const release = async () => {
    if (released) {
      return;
    }
    released = true;
    try {
      await deps.releaseRun(thread.id, runId);
    } catch (error) {
      deps.reportError(error, "subject-thread.release-run");
    }
  };

  try {
    await deps.saveMessage({
      authorUserId: input.actorUserId,
      conversationId: thread.id,
      message: deps.toArcMessage(userMessage),
      organizationId: input.ref.organizationId,
    });
    const history = await toModelHistory(await deps.loadHistory(thread.id));
    const { agent, contextMessage } = deps.createAgent(input.pageContext);
    // 页面上下文放在最新一条用户消息之前，作为本轮的最新状态。
    const modelMessages = contextMessage
      ? [...history.slice(0, -1), contextMessage, ...history.slice(-1)]
      : history;
    const agentStream = await agent.stream(modelMessages, { abortSignal: input.signal });

    const stream = createUIMessageStream<UIMessage>({
      execute: ({ writer }) => {
        writer.merge(
          toAISdkStream(agentStream, {
            from: "agent",
            sendReasoning: false,
            sendSources: false,
            version: "v7",
          }),
        );
      },
      generateId: () => crypto.randomUUID(),
      onEnd: async ({ responseMessage }) => {
        try {
          if (responseMessage.id && responseMessage.parts.length > 0) {
            await deps.saveMessage({
              authorUserId: null,
              conversationId: thread.id,
              message: deps.toArcMessage(responseMessage),
              organizationId: input.ref.organizationId,
            });
          }
        } catch (error) {
          deps.reportError(error, "subject-thread.persist-reply");
        } finally {
          await release();
        }
      },
      onError: (error) => {
        deps.reportError(error, "subject-thread.agent-stream");
        void release();
        return AGENT_UNAVAILABLE_MESSAGE;
      },
      // 以本条用户消息为起点，保证回复作为新的助手消息获得 id 并被持久化。
      originalMessages: [userMessage],
    });
    return { conversationId: thread.id, kind: "stream", stream };
  } catch (error) {
    await release();
    throw error;
  }
}
