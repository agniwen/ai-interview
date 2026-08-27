import { eq } from "drizzle-orm";
import { qualitativeResumeEvaluationSchema } from "@arc/db-schema/qualitative-resume-evaluation";
import type {
  QualitativeResumeEvaluation,
  ResumeEvaluationContractMode,
} from "@arc/db-schema/qualitative-resume-evaluation";
import type { InterviewQuestion } from "@arc/db-schema/interview/types";
import { interviewNotification } from "@arc/db-schema/schema";
import { studioInterviewQuestionClientSchema } from "@arc/db-schema/studio-interviews";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { getRequiredEnv } from "@arc/ai-recruitment-copilot-backend/lib/server/env";
import { generateFeishuHrEvaluationForInterview } from "@arc/ai-recruitment-copilot-backend/server/routes/agent/utils/feishu-hr-evaluation";
import { loadResumePdfAttachment } from "@arc/ai-recruitment-copilot-backend/server/routes/agent/utils/feishu-resume-attachment";
import {
  createFeishuInterviewEvaluationDocx,
  moveFeishuInterviewEvaluationDocx,
  resolveFeishuDocxDocumentId,
} from "@arc/ai-recruitment-copilot-backend/server/routes/feishu/utils/feishu-docx";
import { buildInterviewEvaluationDocument } from "@arc/ai-recruitment-copilot-backend/server/routes/feishu/utils/interview-evaluation-doc";
import type { FeishuProviderId } from "@arc/ai-recruitment-copilot-backend/server/routes/feishu/utils/provider";

type DocumentResumeEvaluation = Pick<QualitativeResumeEvaluation, "detailedOverall">;

const persistedInterviewQuestionsSchema = studioInterviewQuestionClientSchema.array();

interface FeishuInterviewDocumentContext {
  interviewQuestions: InterviewQuestion[];
  qualitativeResumeEvaluation: QualitativeResumeEvaluation | null;
  resumeEvaluationArtifactMode: ResumeEvaluationContractMode | null;
  resumeFileName: string | null;
  resumeStorageKey: string | null;
}

interface FeishuInterviewDocumentInput {
  candidateName: string;
  organizationSlug: string | null;
  roundId: string;
}

function buildResumeUrl(roundId: string, organizationSlug: string | null): string {
  const baseUrl = getRequiredEnv("BETTER_AUTH_URL");
  const root = baseUrl.replace(/\/$/, "");
  const prefix = organizationSlug ? `/w/${encodeURIComponent(organizationSlug)}` : "";
  return `${root}/api${prefix}/studio/interviews/${encodeURIComponent(roundId)}/resume`;
}

function resolveDocumentResumeEvaluation(
  context: FeishuInterviewDocumentContext,
): DocumentResumeEvaluation | null {
  if (context.resumeEvaluationArtifactMode !== "qualitative") {
    return null;
  }
  const parsed = qualitativeResumeEvaluationSchema.safeParse(context.qualitativeResumeEvaluation);
  return parsed.success ? { detailedOverall: parsed.data.detailedOverall } : null;
}

function resolveRecommendedQuestions(context: FeishuInterviewDocumentContext): InterviewQuestion[] {
  const parsed = persistedInterviewQuestionsSchema.safeParse(context.interviewQuestions);
  return parsed.success ? parsed.data : [];
}

export async function ensureInterviewEvaluationDocument({
  context,
  conversationId,
  input,
  interviewRecordId,
  notificationId,
  providerId,
  recipientOpenId,
}: {
  context: FeishuInterviewDocumentContext;
  conversationId: string;
  input: FeishuInterviewDocumentInput;
  interviewRecordId: string;
  notificationId: string;
  providerId: FeishuProviderId;
  recipientOpenId: string;
}): Promise<string> {
  const [existing] = await db
    .select({
      documentId: interviewNotification.feishuDocumentId,
      documentUrl: interviewNotification.feishuDocumentUrl,
    })
    .from(interviewNotification)
    .where(eq(interviewNotification.id, notificationId))
    .limit(1);
  if (existing?.documentUrl) {
    const documentId = resolveFeishuDocxDocumentId(existing.documentId, existing.documentUrl);
    if (documentId) {
      await moveFeishuInterviewEvaluationDocx(providerId, documentId);
    }
    return existing.documentUrl;
  }

  const hrEvaluation = await generateFeishuHrEvaluationForInterview({
    conversationId,
    interviewRecordId,
  });
  const resumePdf = await loadResumePdfAttachment({
    fileName: context.resumeFileName,
    storageKey: context.resumeStorageKey,
  });
  const document = buildInterviewEvaluationDocument({
    candidateName: input.candidateName,
    evaluation: { hrEvaluation },
    includeResumeLink: !resumePdf,
    recommendedQuestions: resolveRecommendedQuestions(context),
    resumeEvaluation: resolveDocumentResumeEvaluation(context),
    resumeUrl: buildResumeUrl(input.roundId, input.organizationSlug),
  });
  const created = await createFeishuInterviewEvaluationDocx(providerId, {
    attachment: resumePdf
      ? {
          bytes: resumePdf,
          fileName: `${input.candidateName.slice(0, 200)}-简历.pdf`,
        }
      : undefined,
    blocks: document.blocks,
    recipientOpenId,
    title: document.title,
  });

  await db
    .update(interviewNotification)
    .set({
      feishuDocumentId: created.documentId,
      feishuDocumentUrl: created.documentUrl,
    })
    .where(eq(interviewNotification.id, notificationId));
  return created.documentUrl;
}
