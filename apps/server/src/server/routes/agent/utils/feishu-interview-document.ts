import { and, eq } from "drizzle-orm";
import type {
  QualitativeResumeEvaluation,
  ResumeEvaluationContractMode,
} from "@app/db-schema/qualitative-resume-evaluation";
import { account, recruitingNotificationDelivery } from "@app/db-schema/schema";
import type { InterviewQuestion } from "@app/db-schema/interview/types";
import type { InterviewDataCollectionResults } from "@app/shared/interview/question-outcomes";
import { parseInterviewDataCollectionResults } from "@app/shared/interview/question-outcomes";
import { db } from "../../../../lib/server/db/index";
import { getRequiredEnv } from "../../../../lib/server/env";
import { captureBackendException } from "../../../../lib/server/sentry";
import { generateFeishuHrEvaluationForInterview } from "./feishu-hr-evaluation";
import { interviewEvaluationSchema } from "./interview-report";
import { loadResumePdfAttachment } from "./feishu-resume-attachment";
import {
  grantFeishuInterviewEvaluationDocxAccess,
  moveFeishuInterviewEvaluationDocx,
} from "../../../integrations/feishu/feishu-docx";
import {
  buildInterviewEvaluationDocument,
  buildInterviewEvaluationStructureSections,
} from "../../../integrations/feishu/interview-evaluation-doc";
import type { FeishuProviderId } from "../../../integrations/feishu/provider";
import { ensureRecordEvaluationDocument } from "../../studio/routes/interviews/application/default-ensure-recruiting-evaluation-document";

type HrEvaluation = ReturnType<typeof interviewEvaluationSchema.parse>["hrEvaluation"];

interface FeishuInterviewDocumentContext {
  organizationId: string;
  dataCollectionResults: unknown;
  evaluationCriteriaResults: unknown;
  interviewQuestions: InterviewQuestion[];
  qualitativeResumeEvaluation: QualitativeResumeEvaluation | null;
  resumeEvaluationArtifactMode: ResumeEvaluationContractMode | null;
  resumeFileName: string | null;
  resumeStorageKey: string | null;
}

const EMPTY_HR_EVALUATION = {
  availability: null,
  careerProgression: null,
  compensationExpectations: null,
  jobMotivation: null,
  overseasTravel: null,
  projectHighlights: null,
  recentWork: null,
} satisfies HrEvaluation;

async function loadHrEvaluationOrFallback({
  conversationId,
  fallback,
  interviewRecordId,
}: {
  conversationId: string;
  fallback: HrEvaluation;
  interviewRecordId: string;
}) {
  try {
    return await generateFeishuHrEvaluationForInterview({ conversationId, interviewRecordId });
  } catch (error) {
    captureBackendException(error, "interview.feishu_hr_evaluation.fallback", {
      conversationId,
      interviewRecordId,
    });
    return fallback;
  }
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
  const created = await ensureRecordEvaluationDocument({
    build: async () => {
      const storedEvaluation = interviewEvaluationSchema.safeParse(
        context.evaluationCriteriaResults,
      );
      const hrEvaluation = await loadHrEvaluationOrFallback({
        conversationId,
        fallback: storedEvaluation.success
          ? storedEvaluation.data.hrEvaluation
          : EMPTY_HR_EVALUATION,
        interviewRecordId,
      });
      const communicationQuestionResults: InterviewDataCollectionResults | null =
        parseInterviewDataCollectionResults(context.dataCollectionResults);
      const resumePdf = await loadResumePdfAttachment({
        fileName: context.resumeFileName,
        storageKey: context.resumeStorageKey,
      });
      const structureSections = buildInterviewEvaluationStructureSections(context);
      const document = buildInterviewEvaluationDocument({
        candidateName: input.candidateName,
        communicationQuestionResults,
        evaluation: { hrEvaluation },
        includeResumeLink: !resumePdf,
        recommendedQuestions: structureSections.recommendedQuestionsBlock
          ? context.interviewQuestions
          : [],
        resumeEvaluation: structureSections.resumeEvaluationBlock
          ? context.qualitativeResumeEvaluation
          : null,
        resumeUrl: buildResumeUrl(input.roundId, input.organizationSlug),
      });
      return {
        attachment: resumePdf
          ? {
              bytes: resumePdf,
              fileName: `${input.candidateName.slice(0, 200)}-简历.pdf`,
            }
          : undefined,
        blocks: document.blocks,
        recipientOpenId,
        title: document.title,
      };
    },
    organizationId: context.organizationId,
    providerId,
    recruitingRecordId: interviewRecordId,
  });
  await moveFeishuInterviewEvaluationDocx(created.providerId, created.documentId);
  // Open IDs are app-specific. Never grant an ID from one Feishu app in another.
  let documentRecipientOpenId = recipientOpenId;
  if (created.providerId !== providerId) {
    const [binding] = await db
      .select({ openId: account.accountId })
      .from(recruitingNotificationDelivery)
      .innerJoin(
        account,
        and(
          eq(account.userId, recruitingNotificationDelivery.recipientUserId),
          eq(account.providerId, created.providerId),
        ),
      )
      .where(eq(recruitingNotificationDelivery.id, notificationId))
      .limit(1);
    if (!binding) {
      throw new Error("评价表属于另一飞书应用，请先绑定该应用账号以获得文档权限");
    }
    documentRecipientOpenId = binding.openId;
  }
  await grantFeishuInterviewEvaluationDocxAccess(created.providerId, {
    documentId: created.documentId,
    recipientOpenId: documentRecipientOpenId,
  });

  await db
    .update(recruitingNotificationDelivery)
    .set({
      feishuDocumentId: created.documentId,
      feishuDocumentUrl: created.documentUrl,
    })
    .where(eq(recruitingNotificationDelivery.id, notificationId));
  return created.documentUrl;
}
