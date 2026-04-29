import type { UIMessage, UIMessageChunk } from "ai";
import { getWritable } from "workflow";
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
    originalMessages: input.messages,
    stream,
    writable,
  });
}

async function persistAssistantMessageStep(args: { conversationId: string; message: UIMessage }) {
  "use step";
  await upsertChatMessage(args);
}

async function clearActiveWorkflowRunIdStep(conversationId: string) {
  "use step";
  await clearActiveWorkflowRunId(conversationId);
}

export async function runResumeChatWorkflow(input: ResumeChatWorkflowInput) {
  "use workflow";

  const writable = getWritable<UIMessageChunk>();

  const assistantMessage = await runScreeningAndStream(input, writable);

  if (assistantMessage) {
    await persistAssistantMessageStep({
      conversationId: input.chatId,
      message: assistantMessage,
    });
  }

  await clearActiveWorkflowRunIdStep(input.chatId);
}
