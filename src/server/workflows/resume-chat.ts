import type { UIMessage, UIMessageChunk } from "ai";
import { getWorkflowMetadata, getWritable } from "workflow";
import { upsertChatMessage } from "@/server/queries/chat";
import { clearActiveWorkflowRunId } from "@/server/queries/workflow-runs";
import { inlineAttachmentsForModel } from "@/server/routes/resume/inline-attachments";
import { pumpAssistantStream, runResumeScreening } from "@/server/routes/resume/screening";

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
): Promise<UIMessage | null> {
  "use step";

  // eslint-disable-next-line no-console -- TEMP debug
  console.log("[workflow] runScreeningAndStream IN", {
    chatId: input.chatId,
    incomingMessageIds: input.messages.map((m) => `${m.role}:${m.id?.slice(0, 8)}`),
    messageId,
  });

  const messagesForModel = await inlineAttachmentsForModel(input.userId, input.messages);

  const result = await runResumeScreening({
    enableThinking: input.enableThinking,
    jobDescription: input.jobDescription,
    messages: messagesForModel,
  });

  // Do NOT pass originalMessages: when the last item is an assistant with
  // tool calls (i.e. the auto-resume turn), the SDK extends that message and
  // reuses its id instead of honouring generateMessageId, which causes our
  // upsertChatMessage to overwrite the previous turn's tool-call row.
  const stream = result.toUIMessageStream({
    generateMessageId: () => messageId,
    sendReasoning: input.enableThinking !== false,
    sendSources: true,
  });

  const accumulated = await pumpAssistantStream({
    stream,
    writable,
  });

  // eslint-disable-next-line no-console -- TEMP debug
  console.log("[workflow] runScreeningAndStream OUT", {
    accumulatedId: accumulated?.id,
    accumulatedRole: accumulated?.role,
    partsSummary: accumulated?.parts?.map((p) => ({
      state: (p as { state?: string }).state,
      type: p.type,
    })),
  });

  return accumulated;
}

async function persistAssistantMessageStep(args: { conversationId: string; message: UIMessage }) {
  "use step";
  // eslint-disable-next-line no-console -- TEMP debug
  console.log("[workflow] persistAssistantMessage", {
    conversationId: args.conversationId,
    messageId: args.message.id,
    partsSummary: args.message.parts?.map((p) => ({
      state: (p as { state?: string }).state,
      type: p.type,
    })),
    role: args.message.role,
  });
  await upsertChatMessage(args);
}

async function clearActiveWorkflowRunIdStep(conversationId: string, runId: string) {
  "use step";
  await clearActiveWorkflowRunId(conversationId, runId);
}

async function closeWritableStep(writable: WritableStream<UIMessageChunk>) {
  "use step";
  const writer = writable.getWriter();
  try {
    await writer.close();
  } catch {
    // Already closed/aborted by an earlier error path — fine to ignore.
  }
}

export async function runResumeChatWorkflow(input: ResumeChatWorkflowInput) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const writable = getWritable<UIMessageChunk>();
  // Derive a deterministic message id from the workflow run id so step
  // retries don't generate a fresh id (which would orphan the chunks
  // already written and produce duplicate rows on persist).
  const messageId = `msg_${workflowRunId}`;

  try {
    const assistantMessage = await runScreeningAndStream(input, writable, messageId);
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
  } catch (error) {
    await clearActiveWorkflowRunIdStep(input.chatId, workflowRunId);
    await closeWritableStep(writable);
    throw error;
  }
}
