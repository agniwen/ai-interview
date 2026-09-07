import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import {
  account,
  organization,
  recruitingEvaluationDocument,
  recruitingRecord,
} from "@app/db-schema/schema";
import { db } from "../../../../../../lib/server/db/index";
import { getRequiredEnv } from "../../../../../../lib/server/env";
import { ensureRecordEvaluationDocument } from "./default-ensure-recruiting-evaluation-document";
import {
  buildInterviewEvaluationDocument,
  buildInterviewEvaluationStructureSections,
} from "../../../../../integrations/feishu/interview-evaluation-doc";
import { FEISHU_PROVIDER_IDS } from "../../../../../integrations/feishu/provider";
import { grantFeishuInterviewEvaluationDocxAccess } from "../../../../../integrations/feishu/feishu-docx";
import { loadResumePdfAttachment } from "../../../../agent/utils/feishu-resume-attachment";
import type { HumanInterviewDocumentSyncJob } from "./sync-human-interview-document";

const defaultDependencies = {
  ensureDocument: ensureRecordEvaluationDocument,
  grantAccess: grantFeishuInterviewEvaluationDocxAccess,
};
export async function ensureHumanEvaluationDocument(
  job: HumanInterviewDocumentSyncJob,
  dependencies = defaultDependencies,
) {
  const [record] = await db
    .select({
      ownerId: recruitingRecord.ownerId,
      record: {
        candidateName: recruitingRecordReadModel.candidateName,
        createdBy: recruitingRecordReadModel.createdBy,
        interviewQuestions: recruitingRecordReadModel.interviewQuestions,
        qualitativeResumeEvaluation: recruitingRecordReadModel.qualitativeResumeEvaluation,
        resumeEvaluationArtifactMode: recruitingRecordReadModel.resumeEvaluationArtifactMode,
        resumeFileName: recruitingRecordReadModel.resumeFileName,
        resumeStorageKey: recruitingRecordReadModel.resumeStorageKey,
      },
      slug: organization.slug,
    })
    .from(recruitingRecordReadModel)
    .innerJoin(organization, eq(organization.id, recruitingRecordReadModel.organizationId))
    .innerJoin(recruitingRecord, eq(recruitingRecord.id, recruitingRecordReadModel.id))
    .where(
      and(
        eq(recruitingRecordReadModel.id, job.recruitingRecordId),
        eq(recruitingRecordReadModel.organizationId, job.organizationId),
      ),
    )
    .limit(1);
  if (!record) {
    throw new Error("招聘记录不存在");
  }
  const userIds = [record.ownerId, record.record.createdBy, job.submittedByUserId].filter(
    (id): id is string => Boolean(id),
  );
  const accounts = userIds.length
    ? await db
        .select({ openId: account.accountId, providerId: account.providerId })
        .from(account)
        .where(
          and(
            inArray(account.userId, userIds),
            inArray(account.providerId, [...FEISHU_PROVIDER_IDS]),
          ),
        )
        .orderBy(desc(account.updatedAt))
    : [];
  const [existing] = await db
    .select()
    .from(recruitingEvaluationDocument)
    .where(
      and(
        eq(recruitingEvaluationDocument.recruitingRecordId, job.recruitingRecordId),
        eq(recruitingEvaluationDocument.organizationId, job.organizationId),
      ),
    )
    .limit(1);
  const provider = existing?.providerId ?? job.providerId ?? accounts[0]?.providerId;
  if (!provider) {
    throw new Error("无法创建飞书评价表：请招聘负责人或评价提交人先绑定飞书账号");
  }
  const providerId = z.enum(FEISHU_PROVIDER_IDS).parse(provider);
  const recipients = accounts.filter((item) => item.providerId === providerId);
  const document = await dependencies.ensureDocument({
    build: async () => {
      if (!recipients[0]) {
        throw new Error("无法创建飞书评价表：缺少对应飞书应用的负责人账号");
      }
      const context = record.record;
      const pdf = await loadResumePdfAttachment({
        fileName: context.resumeFileName,
        storageKey: context.resumeStorageKey,
      });
      const sections = buildInterviewEvaluationStructureSections(context);
      const base = buildInterviewEvaluationDocument({
        candidateName: context.candidateName,
        // No AI interview: leave HR/communication evidence empty, never fabricate it.
        communicationQuestionResults: null,
        evaluation: { hrEvaluation: {} },
        includeResumeLink: !pdf && Boolean(context.resumeStorageKey),
        recommendedQuestions: sections.recommendedQuestionsBlock ? context.interviewQuestions : [],
        resumeEvaluation: sections.resumeEvaluationBlock
          ? context.qualitativeResumeEvaluation
          : null,
        resumeUrl: `${getRequiredEnv("BETTER_AUTH_URL").replace(/\/$/, "")}/api/w/${encodeURIComponent(record.slug)}/studio/resumes/${encodeURIComponent(job.recruitingRecordId)}/resume`,
      });
      return {
        ...base,
        attachment: pdf
          ? { bytes: pdf, fileName: `${context.candidateName.slice(0, 200)}-简历.pdf` }
          : undefined,
        recipientOpenId: recipients[0].openId,
      };
    },
    organizationId: job.organizationId,
    providerId,
    recruitingRecordId: job.recruitingRecordId,
  });
  for (const recipient of recipients) {
    await dependencies.grantAccess(document.providerId, {
      documentId: document.documentId,
      recipientOpenId: recipient.openId,
    });
  }
  if (job.documentId && job.documentId !== document.documentId && job.blockId) {
    throw new Error("历史真人评价位于另一份文档，请先合并评价内容再恢复同步");
  }
  return { ...job, ...document };
}
