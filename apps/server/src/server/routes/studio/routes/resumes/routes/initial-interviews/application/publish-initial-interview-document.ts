import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  account,
  organization,
  recruitingEvaluationDocument,
  recruitingRecord,
} from "@app/db-schema/schema";
import { db } from "../../../../../../../../lib/server/db";
import { getRequiredEnv } from "../../../../../../../../lib/server/env";
import { FEISHU_PROVIDER_IDS } from "../../../../../../../integrations/feishu/provider";
import {
  buildHrInterviewEvaluationBlock,
  buildInterviewEvaluationDocument,
} from "../../../../../../../integrations/feishu/interview-evaluation-doc";
import { replaceFeishuHrInitialInterview } from "../../../../../../../integrations/feishu/feishu-docx";
import { ensureRecordEvaluationDocument } from "../../../../interviews/application/default-ensure-recruiting-evaluation-document";
import { loadResumePdfAttachment } from "../../../../../../agent/utils/feishu-resume-attachment";
import { InitialInterviewError } from "../errors";
import type { InitialInterviewEvaluation, InitialInterviewJob } from "./process-initial-interview";

export async function publishInitialInterviewDocument(
  job: InitialInterviewJob,
  evaluation: InitialInterviewEvaluation,
) {
  const [record] = await db
    .select({
      createdBy: recruitingRecord.createdBy,
      ownerId: recruitingRecord.ownerId,
      slug: organization.slug,
    })
    .from(recruitingRecord)
    .innerJoin(organization, eq(organization.id, recruitingRecord.organizationId))
    .where(
      and(
        eq(recruitingRecord.id, job.recruitingRecordId),
        eq(recruitingRecord.organizationId, job.organizationId),
      ),
    )
    .limit(1);
  if (!record) {
    throw new InitialInterviewError("招聘记录不存在。", 404);
  }
  const [existing] = await db
    .select()
    .from(recruitingEvaluationDocument)
    .where(
      and(
        eq(recruitingEvaluationDocument.organizationId, job.organizationId),
        eq(recruitingEvaluationDocument.recruitingRecordId, job.recruitingRecordId),
      ),
    )
    .limit(1);
  if (
    existing?.documentId &&
    existing.documentId !== job.overwriteDocumentId &&
    existing.documentId !== job.documentId
  ) {
    throw new InitialInterviewError("已有飞书评价表，请确认覆盖 HR 初面七项后重试。");
  }
  const userIds = [record.ownerId, record.createdBy, job.actorId].filter((id): id is string =>
    Boolean(id),
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
  const provider = existing?.providerId ?? accounts[0]?.providerId;
  if (!provider) {
    throw new InitialInterviewError("请招聘负责人或生成操作人先绑定飞书账号，再重试生成。");
  }
  const providerId = z.enum(FEISHU_PROVIDER_IDS).parse(provider);
  const recipient = accounts.find((item) => item.providerId === providerId);
  let initializedFromThisJob = false;
  const document = await ensureRecordEvaluationDocument({
    build: async () => {
      if (!recipient) {
        throw new InitialInterviewError("缺少对应飞书应用的负责人账号，请绑定后重试。");
      }
      const pdf = job.snapshot.resume ? await loadResumePdfAttachment(job.snapshot.resume) : null;
      const base = getRequiredEnv("BETTER_AUTH_URL").replace(/\/$/, "");
      const built = buildInterviewEvaluationDocument({
        candidateName: job.snapshot.candidateName,
        communicationQuestionResults: null,
        evaluation: { hrEvaluation: evaluation },
        includeResumeLink: !pdf && Boolean(job.snapshot.resume),
        recommendedQuestions: job.snapshot.interviewQuestions,
        resumeEvaluation: job.snapshot.qualitativeResumeEvaluation,
        resumeUrl: `${base}/api/w/${encodeURIComponent(record.slug)}/studio/resumes/${encodeURIComponent(job.recruitingRecordId)}/initial-interviews/${encodeURIComponent(job.initialInterviewId)}/resume`,
      });
      initializedFromThisJob = true;
      return {
        ...built,
        attachment: pdf
          ? { bytes: pdf, fileName: `${job.snapshot.candidateName.slice(0, 200)}-简历.pdf` }
          : undefined,
        recipientOpenId: recipient.openId,
      };
    },
    organizationId: job.organizationId,
    providerId,
    recruitingRecordId: job.recruitingRecordId,
  });
  if (!initializedFromThisJob) {
    if (document.documentId !== job.overwriteDocumentId && document.documentId !== job.documentId) {
      throw new InitialInterviewError("飞书评价表已创建，请确认覆盖 HR 初面七项后重试。");
    }
    await replaceFeishuHrInitialInterview(document.providerId, {
      block: buildHrInterviewEvaluationBlock({
        candidateName: job.snapshot.candidateName,
        evaluation: { hrEvaluation: evaluation },
      }).block,
      documentId: document.documentId,
    });
  }
  return document;
}
