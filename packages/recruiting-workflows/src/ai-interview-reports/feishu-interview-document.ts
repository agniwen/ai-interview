import { and, eq } from "drizzle-orm";
import type {
  QualitativeResumeEvaluation,
  ResumeEvaluationContractMode,
} from "@app/db-schema/qualitative-resume-evaluation";
import { account, recruitingNotificationDelivery } from "@app/db-schema/schema";
import { recruitingRecordReadModel } from "@app/recruiting/read-model";
import { generateCandidateInterviewQuestions } from "@app/resume-processing/review/resumes/utils/candidate-question-generation";
import type { InterviewQuestion } from "@app/db-schema/interview/types";
import { db } from "@app/database/context";
import { getRequiredEnv } from "../runtime/env";
import { captureBackendException } from "../runtime/sentry";
import { generateFeishuHrEvaluationForInterview } from "./feishu-hr-evaluation";
import { interviewEvaluationSchema } from "./interview-report";
import { loadResumeAttachment } from "./feishu-resume-attachment";
import {
  grantFeishuInterviewEvaluationDocxAccess,
  moveFeishuInterviewEvaluationDocx,
  replaceFeishuHrInitialInterview,
  updateFeishuInterviewEvaluationDocxStructure,
} from "@app/feishu/docx";
import {
  buildHrInterviewEvaluationBlock,
  buildInterviewEvaluationDocument,
  buildInterviewEvaluationStructureSections,
} from "@app/feishu/interview-evaluation-doc";
import type { FeishuDocumentBlock } from "@app/feishu/interview-evaluation-doc";
import type { FeishuProviderId } from "@app/feishu/provider";
import { ensureRecordEvaluationDocument } from "../evaluation-documents/default-ensure-recruiting-evaluation-document";

type HrEvaluation = ReturnType<typeof interviewEvaluationSchema.parse>["hrEvaluation"];

interface FeishuInterviewDocumentContext {
  organizationId: string;
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

/**
 * 评价表的推荐面试题依赖候选人题目；转入等异步补题未完成时在这里补生成，
 * 生成失败不阻断评价表与通知。
 */
export async function resolveRecommendedInterviewQuestions({
  current,
  generate,
  reload,
}: {
  current: InterviewQuestion[];
  generate(): Promise<Awaited<ReturnType<typeof generateCandidateInterviewQuestions>>>;
  reload(): Promise<InterviewQuestion[]>;
}): Promise<InterviewQuestion[]> {
  if (current.length > 0) {
    return current;
  }
  try {
    const generation = await generate();
    if (generation === "generated" || generation === "already_generated") {
      return await reload();
    }
  } catch (error) {
    captureBackendException(error, "interview.feishu_evaluation.question_generation");
  }
  return current;
}

export async function ensureAiHrEvaluationInDocument<
  TDocument extends { documentId: string; providerId: FeishuProviderId },
  TInitialization,
>({
  build,
  candidateName,
  ensureDocument,
  loadHrEvaluation,
  replaceHrEvaluation,
}: {
  build(hrEvaluation: HrEvaluation): Promise<TInitialization>;
  candidateName: string;
  ensureDocument(build: () => Promise<TInitialization>): Promise<TDocument>;
  loadHrEvaluation(): Promise<HrEvaluation>;
  replaceHrEvaluation(
    providerId: FeishuProviderId,
    input: { block: FeishuDocumentBlock; documentId: string },
  ): Promise<void>;
}): Promise<TDocument> {
  let initializedWithAiEvaluation = false;
  const document = await ensureDocument(async () => {
    const initialization = await build(await loadHrEvaluation());
    initializedWithAiEvaluation = true;
    return initialization;
  });
  if (!initializedWithAiEvaluation) {
    const hrEvaluation = await loadHrEvaluation();
    if (Object.values(hrEvaluation).some((answer) => answer?.trim())) {
      await replaceHrEvaluation(document.providerId, {
        block: buildHrInterviewEvaluationBlock({
          candidateName,
          evaluation: { hrEvaluation },
        }).block,
        documentId: document.documentId,
      });
    }
  }
  return document;
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
  const storedEvaluation = interviewEvaluationSchema.safeParse(context.evaluationCriteriaResults);
  const loadHrEvaluation = () =>
    loadHrEvaluationOrFallback({
      conversationId,
      fallback: storedEvaluation.success ? storedEvaluation.data.hrEvaluation : EMPTY_HR_EVALUATION,
      interviewRecordId,
    });
  const interviewQuestions = await resolveRecommendedInterviewQuestions({
    current: context.interviewQuestions,
    generate: () =>
      generateCandidateInterviewQuestions({
        organizationId: context.organizationId,
        resumeRecordId: interviewRecordId,
      }),
    reload: async () => {
      const [row] = await db
        .select({ interviewQuestions: recruitingRecordReadModel.interviewQuestions })
        .from(recruitingRecordReadModel)
        .where(
          and(
            eq(recruitingRecordReadModel.id, interviewRecordId),
            eq(recruitingRecordReadModel.organizationId, context.organizationId),
          ),
        )
        .limit(1);
      return row?.interviewQuestions ?? [];
    },
  });
  const documentContext = { ...context, interviewQuestions };
  const structureSections = buildInterviewEvaluationStructureSections(documentContext);
  const created = await ensureAiHrEvaluationInDocument({
    build: async (hrEvaluation) => {
      const resumeAttachment = await loadResumeAttachment({
        fileName: context.resumeFileName,
        storageKey: context.resumeStorageKey,
      });
      const document = buildInterviewEvaluationDocument({
        candidateName: input.candidateName,
        evaluation: { hrEvaluation },
        includeResumeLink: !resumeAttachment,
        recommendedQuestions: structureSections.recommendedQuestionsBlock ? interviewQuestions : [],
        resumeEvaluation: structureSections.resumeEvaluationBlock
          ? context.qualitativeResumeEvaluation
          : null,
        resumeUrl: buildResumeUrl(input.roundId, input.organizationSlug),
      });
      return {
        attachment: resumeAttachment ?? undefined,
        blocks: document.blocks,
        recipientOpenId,
        title: document.title,
      };
    },
    candidateName: input.candidateName,
    ensureDocument: (build) =>
      ensureRecordEvaluationDocument({
        build,
        organizationId: context.organizationId,
        providerId,
        recruitingRecordId: interviewRecordId,
      }),
    loadHrEvaluation,
    replaceHrEvaluation: replaceFeishuHrInitialInterview,
  });
  // 评价表按招聘记录复用；先创建时没有题目的文档在这里补齐推荐面试题。
  if (structureSections.recommendedQuestionsBlock) {
    try {
      await updateFeishuInterviewEvaluationDocxStructure(created.providerId, {
        documentId: created.documentId,
        recommendedQuestionsBlock: structureSections.recommendedQuestionsBlock,
      });
    } catch (error) {
      captureBackendException(error, "interview.feishu_evaluation.recommended_questions", {
        documentId: created.documentId,
        interviewRecordId,
      });
    }
  }
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
