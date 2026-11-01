import "../standalone/preload";

import { pathToFileURL } from "node:url";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { recruitingEvaluationDocument } from "@app/db-schema/schema";
import { updateFeishuInterviewEvaluationDocxStructure } from "@app/feishu/docx";
import { buildInterviewEvaluationStructureSections } from "@app/feishu/interview-evaluation-doc";
import { FEISHU_PROVIDER_IDS } from "@app/feishu/provider";
import { recruitingRecordReadModel } from "@app/recruiting/read-model";
import { generateCandidateInterviewQuestions } from "@app/resume-processing/review/resumes/utils/candidate-question-generation";
import { db } from "../infrastructure/db/index";

/**
 * 回填人才库转入记录缺失的推荐面试题，并把题目补进已经创建的飞书评价表。
 *
 * 默认只演练；加 --apply 才会生成题目并修改飞书文档。生成只写空题目记录，
 * 文档同步按板块内容比对，重复运行不会产生重复板块。
 *
 *   bun --env-file=../web/.env src/scripts/backfill-pool-import-interview-questions.ts
 *   bun --env-file=../web/.env src/scripts/backfill-pool-import-interview-questions.ts --record-id=<id> --apply
 */

const POOL_SOURCE_TYPES = ["public_pool", "private_pool"] as const;
const DEFAULT_CONCURRENCY = 3;

export interface BackfillPoolQuestionOptions {
  apply: boolean;
  concurrency: number;
  recordId?: string;
}

export function parseBackfillPoolQuestionOptions(argv: string[]): BackfillPoolQuestionOptions {
  const options: BackfillPoolQuestionOptions = { apply: false, concurrency: DEFAULT_CONCURRENCY };
  for (const argument of argv) {
    if (argument === "--apply") {
      options.apply = true;
      continue;
    }
    const [key, value] = argument.split("=", 2);
    if (key === "--record-id" && value) {
      options.recordId = value;
    } else if (key === "--concurrency" && value) {
      options.concurrency = Number.parseInt(value, 10);
    } else {
      throw new Error(`未知参数：${argument}`);
    }
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1) {
    throw new Error("--concurrency 必须是正整数。");
  }
  return options;
}

async function loadTargets(options: BackfillPoolQuestionOptions) {
  const hasNoQuestions = sql`${recruitingRecordReadModel.interviewQuestions} = '[]'::jsonb`;
  return await db
    .select({
      candidateName: recruitingRecordReadModel.candidateName,
      documentId: recruitingEvaluationDocument.documentId,
      documentProviderId: recruitingEvaluationDocument.providerId,
      documentStatus: recruitingEvaluationDocument.status,
      hasResumeProfile: sql<boolean>`${recruitingRecordReadModel.resumeProfile} IS NOT NULL`,
      id: recruitingRecordReadModel.id,
      interviewQuestions: recruitingRecordReadModel.interviewQuestions,
      organizationId: recruitingRecordReadModel.organizationId,
    })
    .from(recruitingRecordReadModel)
    .leftJoin(
      recruitingEvaluationDocument,
      and(
        eq(recruitingEvaluationDocument.recruitingRecordId, recruitingRecordReadModel.id),
        eq(recruitingEvaluationDocument.organizationId, recruitingRecordReadModel.organizationId),
      ),
    )
    .where(
      and(
        inArray(recruitingRecordReadModel.resumeSourceType, [...POOL_SOURCE_TYPES]),
        or(hasNoQuestions, eq(recruitingEvaluationDocument.status, "ready")),
        options.recordId ? eq(recruitingRecordReadModel.id, options.recordId) : undefined,
      ),
    )
    .orderBy(asc(recruitingRecordReadModel.createdAt));
}

type Target = Awaited<ReturnType<typeof loadTargets>>[number];

interface TargetLog {
  candidateName: string;
  document?:
    | "skip_no_questions"
    | "would_sync"
    | Awaited<ReturnType<typeof updateFeishuInterviewEvaluationDocxStructure>>;
  questions:
    | "missing_profile"
    | "present"
    | "would_generate"
    | Awaited<ReturnType<typeof generateCandidateInterviewQuestions>>;
  recordId: string;
}

async function reloadStructureSource(target: Target) {
  const [row] = await db
    .select({
      interviewQuestions: recruitingRecordReadModel.interviewQuestions,
      qualitativeResumeEvaluation: recruitingRecordReadModel.qualitativeResumeEvaluation,
      resumeEvaluationArtifactMode: recruitingRecordReadModel.resumeEvaluationArtifactMode,
    })
    .from(recruitingRecordReadModel)
    .where(
      and(
        eq(recruitingRecordReadModel.id, target.id),
        eq(recruitingRecordReadModel.organizationId, target.organizationId),
      ),
    )
    .limit(1);
  if (!row) {
    throw new Error("招聘记录不存在");
  }
  return row;
}

async function processTarget(target: Target, apply: boolean): Promise<TargetLog> {
  const log: TargetLog = {
    candidateName: target.candidateName,
    questions: "present",
    recordId: target.id,
  };
  if (target.interviewQuestions.length === 0) {
    if (!target.hasResumeProfile) {
      log.questions = "missing_profile";
    } else if (apply) {
      log.questions = await generateCandidateInterviewQuestions({
        organizationId: target.organizationId,
        resumeRecordId: target.id,
      });
    } else {
      log.questions = "would_generate";
    }
  }

  if (target.documentStatus !== "ready" || !target.documentId) {
    return log;
  }
  if (!apply) {
    log.document = log.questions === "missing_profile" ? "skip_no_questions" : "would_sync";
    return log;
  }
  const source = await reloadStructureSource(target);
  const { recommendedQuestionsBlock } = buildInterviewEvaluationStructureSections(source);
  if (!recommendedQuestionsBlock) {
    log.document = "skip_no_questions";
    return log;
  }
  const result = await updateFeishuInterviewEvaluationDocxStructure(
    z.enum(FEISHU_PROVIDER_IDS).parse(target.documentProviderId),
    { documentId: target.documentId, recommendedQuestionsBlock },
  );
  log.document = result;
  return log;
}

export async function runBackfillPoolQuestions(options: BackfillPoolQuestionOptions) {
  const targets = await loadTargets(options);
  console.log(
    JSON.stringify({ apply: options.apply, event: "targets_loaded", total: targets.length }),
  );
  let failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < targets.length) {
      const target = targets[next];
      next += 1;
      if (!target) {
        continue;
      }
      try {
        console.log(
          JSON.stringify({ event: "processed", ...(await processTarget(target, options.apply)) }),
        );
      } catch (error) {
        failed += 1;
        console.error(
          JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            event: "failed",
            recordId: target.id,
          }),
        );
      }
    }
  };
  await Promise.all(Array.from({ length: options.concurrency }, worker));
  console.log(JSON.stringify({ event: "done", failed, total: targets.length }));
  return failed;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const failed = await runBackfillPoolQuestions(
    parseBackfillPoolQuestionOptions(process.argv.slice(2)),
  );
  process.exit(failed > 0 ? 1 : 0);
}
