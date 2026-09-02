import type { FeishuEvaluationDocumentStatus } from "@app/shared/studio-interview-rounds";
import { hasExistingInterviewAnswers } from "@app/shared/interview/question-outcomes";

interface EvaluationDocumentConversation {
  conversationId: string;
  dataCollectionResults: unknown;
  summaryStatus: string;
}

export interface FeishuEvaluationDocumentProjection {
  status: FeishuEvaluationDocumentStatus;
  url: string | null;
}

const UNAVAILABLE_FEISHU_EVALUATION_DOCUMENT = {
  status: "unavailable",
  url: null,
} satisfies FeishuEvaluationDocumentProjection;

export function resolveEvaluationDocument(
  conversation: EvaluationDocumentConversation,
  documentUrlsByConversationId: Map<string, string>,
): FeishuEvaluationDocumentProjection {
  const url = documentUrlsByConversationId.get(conversation.conversationId) ?? null;
  if (url) {
    return { status: "generated", url };
  }
  if (hasExistingInterviewAnswers(conversation.dataCollectionResults)) {
    return { status: "answers_available", url: null };
  }
  return UNAVAILABLE_FEISHU_EVALUATION_DOCUMENT;
}
