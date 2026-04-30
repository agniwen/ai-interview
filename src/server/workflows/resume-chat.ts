import type { UIMessage, UIMessageChunk } from "ai";
import { setTimeout as sleep } from "node:timers/promises";
import { getWorkflowMetadata, getWritable } from "workflow";
import { getRun } from "workflow/api";
import { upsertChatMessage } from "@/server/queries/chat";
import { clearActiveWorkflowRunId } from "@/server/queries/workflow-runs";
import { inlineAttachmentsForModel } from "@/server/routes/resume/inline-attachments";
import { pumpAssistantStream, runResumeScreening } from "@/server/routes/resume/screening";

/**
 * 在 step 内轮询自身 workflow run 的 status, 一旦发现变成 "cancelled"
 * (由 `/api/resume/by-chat/:chatId/stop` 的 `run.cancel()` 触发) 立刻 abort
 * 传入的 controller, 让底层 agent.stream / fetch 立即中断。
 *
 * Polls this run's own status from inside the step. When `run.cancel()` flips
 * status to "cancelled", abort the controller so the agent stream tears down.
 *
 * - 调用方负责在 finally 里 `stop()` + `await done` 防止泄漏。
 * - Caller must `stop()` and `await done` in finally to avoid leaks.
 */
function startWorkflowStopMonitor(runId: string, controller: AbortController) {
  const POLL_INTERVAL_MS = 200;
  // 用一个独立的 AbortController 表示 monitor 自身是否退出, 避免 lint
  // `no-unmodified-loop-condition`(它看不到闭包外通过 stop() 改变标志)。
  // Use a dedicated AbortController for monitor lifecycle so the poll loop
  // condition is signal-driven (avoids the unmodified-loop-condition lint).
  const monitorAbort = new AbortController();

  const done = (async () => {
    const run = getRun(runId);
    while (!monitorAbort.signal.aborted && !controller.signal.aborted) {
      try {
        const status = await run.status;
        if (status === "cancelled") {
          controller.abort();
          return;
        }
      } catch {
        // 忽略短暂的 status 查询失败, 下一轮再试。
        // Ignore transient status lookup failures; retry next tick.
      }
      try {
        await sleep(POLL_INTERVAL_MS, undefined, { signal: monitorAbort.signal });
      } catch {
        // sleep aborted by stop() — exit gracefully.
        return;
      }
    }
  })();

  return {
    done,
    stop() {
      monitorAbort.abort();
    },
  };
}

export interface ResumeChatWorkflowInput {
  chatId: string;
  userId: string;
  messages: UIMessage[];
  jobDescription?: string;
  enableThinking?: boolean;
}

async function runScreeningAndStream(
  input: ResumeChatWorkflowInput,
  writable: WritableStream<UIMessageChunk>,
  messageId: string,
  workflowRunId: string,
): Promise<UIMessage | null> {
  "use step";

  const messagesForModel = await inlineAttachmentsForModel(input.userId, input.messages);

  // Stop monitor: 客户端点 stop 时, /stop 端点会调用 run.cancel(), 这里轮询
  // 自身 run 的 status, 检测到 "cancelled" 后 abort, 让 agent.stream 提前停止。
  // Stop monitor: when the client clicks stop, /stop calls run.cancel(); we
  // poll this run's own status and abort the controller on "cancelled" so the
  // underlying agent.stream tears down promptly.
  const abortController = new AbortController();
  const stopMonitor = startWorkflowStopMonitor(workflowRunId, abortController);

  const result = await runResumeScreening({
    abortSignal: abortController.signal,
    enableThinking: input.enableThinking,
    jobDescription: input.jobDescription,
    messages: messagesForModel,
  });

  // 关于 messageId 与 originalMessages 的设计:
  // - originalMessages 末尾若是 assistant, AI SDK 会**故意**把 messageId 改成那条
  //   assistant 的 id —— 这是 multi-step agent 的 continuation 模式: 工具调用回来后
  //   的下一轮 step 仍属于同一条 assistant message, parts 会被追加而非另起一条。
  // - SDK 在 onFinish 回调里返回的 `responseMessage` 是合并后的完整 message
  //   (lastMessage 的所有 parts + 这一轮的新 parts),正是我们需要落库的版本。
  //
  // Why we keep the trailing assistant in originalMessages:
  //   When originalMessages ends with an assistant, AI SDK intentionally
  //   reuses that assistant's id and treats the new chunks as a continuation
  //   (same assistant turn, additional steps appended to its parts). The
  //   `onFinish` callback hands back the merged `responseMessage` (lastMessage
  //   parts + new parts) — that's the version we persist.
  let accumulated: UIMessage | null = null;
  try {
    const stream = result.toUIMessageStream({
      generateMessageId: () => messageId,
      onFinish: ({ responseMessage }) => {
        accumulated = responseMessage;
      },
      originalMessages: input.messages,
      sendReasoning: input.enableThinking !== false,
      sendSources: true,
    });

    await pumpAssistantStream({
      stream,
      writable,
    });

    return accumulated;
  } finally {
    stopMonitor.stop();
    await stopMonitor.done;
  }
}

async function persistAssistantMessageStep(args: { conversationId: string; message: UIMessage }) {
  "use step";
  await upsertChatMessage(args);
}

async function clearActiveWorkflowRunIdStep(conversationId: string, runId: string) {
  "use step";
  await clearActiveWorkflowRunId(conversationId, runId);
}

async function closeWritableStep(writable: WritableStream<UIMessageChunk>) {
  "use step";
  await writable.close();
}

export async function runResumeChatWorkflow(input: ResumeChatWorkflowInput) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const writable = getWritable<UIMessageChunk>();
  // Derive a deterministic message id from the workflow run id so step
  // retries don't generate a fresh id (which would orphan the chunks
  // already written and produce duplicate rows on persist).
  const messageId = `msg_${workflowRunId}`;

  // 用 cleanedUp 标志避免成功路径和 finally 兜底重复 close —— 与 open-agents
  // chat workflow 的 streamClosed 模式对齐 (apps/web/app/workflows/chat.ts:933, 957)。
  // Mirrors open-agents' streamClosed pattern: a flag prevents the success
  // path and the catch-all finally from both running cleanup, since
  // writable.close() throws on an already-closed stream.
  let cleanedUp = false;

  try {
    const assistantMessage = await runScreeningAndStream(input, writable, messageId, workflowRunId);
    if (assistantMessage) {
      await persistAssistantMessageStep({
        conversationId: input.chatId,
        message: assistantMessage,
      });
    }
    // Order matters: clear the active run id BEFORE closing the writable so
    // the client's auto-resume POST (triggered by stream finish) finds a
    // NULL active run and starts a fresh workflow for the next turn.
    await clearActiveWorkflowRunIdStep(input.chatId, workflowRunId);
    await closeWritableStep(writable);
    cleanedUp = true;
  } finally {
    if (!cleanedUp) {
      // 出错路径: 兜底清理。任何一个 step 抛错时确保 activeWorkflowRunId 被清掉
      // 且 writable 被关闭, 避免 chat 永远卡在"streaming"状态。
      // Error path: best-effort cleanup. If any step throws, still clear the
      // active run id and close the writable so the chat is never permanently
      // marked as streaming.
      try {
        await clearActiveWorkflowRunIdStep(input.chatId, workflowRunId);
      } catch (cleanupError) {
        console.error("[workflow] failed to clear active run id during cleanup", cleanupError);
      }
      try {
        await closeWritableStep(writable);
      } catch (cleanupError) {
        console.error("[workflow] failed to close writable during cleanup", cleanupError);
      }
    }
  }
}
