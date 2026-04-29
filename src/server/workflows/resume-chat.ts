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
): Promise<UIMessage | null> {
  "use step";

  const messagesForModel = await inlineAttachmentsForModel(input.userId, input.messages);

  const result = await runResumeScreening({
    enableThinking: input.enableThinking,
    jobDescription: input.jobDescription,
    messages: messagesForModel,
  });

  const stream = result.toUIMessageStream({
    generateMessageId: () => crypto.randomUUID(),
    originalMessages: input.messages,
    sendReasoning: input.enableThinking !== false,
    sendSources: true,
  });

  return await pumpAssistantStream({
    stream,
    writable,
  });
}

async function persistAssistantMessageStep(args: { conversationId: string; message: UIMessage }) {
  "use step";
  await upsertChatMessage(args);
}

async function clearActiveWorkflowRunIdStep(conversationId: string, runId: string) {
  "use step";
  await clearActiveWorkflowRunId(conversationId, runId);
}

export async function runResumeChatWorkflow(input: ResumeChatWorkflowInput) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const writable = getWritable<UIMessageChunk>();

  try {
    const assistantMessage = await runScreeningAndStream(input, writable);
    if (assistantMessage) {
      await persistAssistantMessageStep({
        conversationId: input.chatId,
        message: assistantMessage,
      });
    }
  } finally {
    await clearActiveWorkflowRunIdStep(input.chatId, workflowRunId);
  }
}
