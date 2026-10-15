// 为工作区最近的人才库记录和招聘台各节点最近的记录补做候选人头像识别。
// Backfills candidate headshots for a workspace's most recent talent-pool records and the most
// recent recruiting records in each pipeline node.
//
//   bun src/scripts/backfill-candidate-avatars.ts             # dry run: list targets only
//   bun src/scripts/backfill-candidate-avatars.ts --apply     # run extraction and record results
//
// 头像按简历内容哈希保存，脚本按哈希去重；已有识别结果、或失败已达重试上限的简历会跳过，可安全重跑。
// Avatars are keyed by content hash, so targets are de-duplicated by hash. Resumes with a result,
// or whose failures reached the retry limit, are skipped, so the script is safe to rerun.

import "../standalone/preload";

import { pathToFileURL } from "node:url";
import { and, desc, eq, inArray } from "drizzle-orm";
import { recruitingPipelineNodeValues } from "@app/db-schema/recruiting-contracts";
import type { PipelineStage } from "@app/db-schema/recruiting-contracts";
import { resumeCandidateAvatar, resumePoolItem } from "@app/db-schema/schema";
import { getObjectBytes } from "@app/object-storage";
import { recruitingRecordReadModel } from "@app/recruiting/read-model";
import {
  CANDIDATE_AVATAR_MAX_ATTEMPTS,
  ensureCandidateAvatar,
} from "@app/resume-processing/ingest/support/candidate-avatar";
import { getResumeDocumentKind } from "@app/shared/resume-documents";

const DEFAULT_WORKSPACE_ID = "org_default";
const DEFAULT_POOL_LIMIT = 100;
const DEFAULT_STAGE_LIMIT = 30;
const DEFAULT_CONCURRENCY = 4;
const MAX_CONCURRENCY = 8;

export interface BackfillCandidateAvatarOptions {
  apply: boolean;
  concurrency: number;
  poolLimit: number;
  stageLimit: number;
  workspaceId: string;
}

export interface AvatarTargetRecord {
  candidateName: string;
  contentHash: string | null;
  fileName: string | null;
  recordId: string;
  source: "pool" | PipelineStage;
  storageKey: string | null;
}

export interface AvatarBackfillTarget {
  contentHash: string;
  fileName: string | null;
  records: AvatarTargetRecord[];
  storageKey: string;
}

export interface ExistingAvatarAttempt {
  attempts: number;
  status: string;
}

export interface GroupedAvatarTargets {
  missingFile: AvatarTargetRecord[];
  targets: AvatarBackfillTarget[];
}

export type AvatarTargetSkipReason =
  | "already_detected"
  | "already_not_detected"
  | "missing_resume_file"
  | "retry_limit_reached"
  | "unsupported_format";

function parsePositiveInteger(value: string, name: string, max: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error(`${name} 必须是 1 到 ${max} 之间的整数。`);
  }
  return parsed;
}

export function parseBackfillCandidateAvatarOptions(
  argv: string[],
): BackfillCandidateAvatarOptions {
  const options: BackfillCandidateAvatarOptions = {
    apply: false,
    concurrency: DEFAULT_CONCURRENCY,
    poolLimit: DEFAULT_POOL_LIMIT,
    stageLimit: DEFAULT_STAGE_LIMIT,
    workspaceId: DEFAULT_WORKSPACE_ID,
  };
  for (const argument of argv) {
    if (argument === "--apply") {
      options.apply = true;
      continue;
    }
    const [key, value] = argument.split("=", 2);
    if (key === "--workspace" && value) {
      options.workspaceId = value;
    } else if (key === "--pool-limit" && value) {
      options.poolLimit = parsePositiveInteger(value, "--pool-limit", 1000);
    } else if (key === "--stage-limit" && value) {
      options.stageLimit = parsePositiveInteger(value, "--stage-limit", 500);
    } else if (key === "--concurrency" && value) {
      options.concurrency = parsePositiveInteger(value, "--concurrency", MAX_CONCURRENCY);
    } else {
      throw new Error(`未知参数：${argument}`);
    }
  }
  return options;
}

// 同一份简历（相同内容哈希）只识别一次；没有文件或哈希的记录单独计数。
// Each resume file (content hash) is extracted once; records without a file or hash are counted
// separately.
export function groupAvatarTargets(records: AvatarTargetRecord[]): GroupedAvatarTargets {
  const byHash = new Map<string, AvatarBackfillTarget>();
  const missingFile: AvatarTargetRecord[] = [];
  for (const record of records) {
    if (!(record.contentHash && record.storageKey)) {
      missingFile.push(record);
      continue;
    }
    const existing = byHash.get(record.contentHash);
    if (existing) {
      existing.records.push(record);
    } else {
      byHash.set(record.contentHash, {
        contentHash: record.contentHash,
        fileName: record.fileName,
        records: [record],
        storageKey: record.storageKey,
      });
    }
  }
  return { missingFile, targets: [...byHash.values()] };
}

export function classifyAvatarTarget(
  target: AvatarBackfillTarget,
  attempt: ExistingAvatarAttempt | undefined,
): AvatarTargetSkipReason | "eligible" {
  const kind = getResumeDocumentKind({ fileName: target.fileName ?? target.storageKey });
  if (!(kind === "pdf" || kind === "image")) {
    return "unsupported_format";
  }
  if (!attempt) {
    return "eligible";
  }
  if (attempt.status === "detected") {
    return "already_detected";
  }
  if (attempt.status === "not_detected") {
    return "already_not_detected";
  }
  return attempt.attempts < CANDIDATE_AVATAR_MAX_ATTEMPTS ? "eligible" : "retry_limit_reached";
}

function countBy<T>(items: readonly T[], key: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const name = key(item);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Object.fromEntries(counts);
}

async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];
      if (item !== undefined) {
        await worker(item, index);
      }
    }
  });
  await Promise.all(runners);
}

async function backfillCandidateAvatars(options: BackfillCandidateAvatarOptions): Promise<void> {
  const { closeDatabase, db } = await import("../infrastructure/db/index");
  try {
    const poolRows = await db
      .select({
        candidateName: resumePoolItem.candidateName,
        contentHash: resumePoolItem.resumeContentHash,
        fileName: resumePoolItem.resumeFileName,
        recordId: resumePoolItem.id,
        storageKey: resumePoolItem.resumeStorageKey,
      })
      .from(resumePoolItem)
      .where(
        and(
          eq(resumePoolItem.organizationId, options.workspaceId),
          eq(resumePoolItem.status, "active"),
        ),
      )
      .orderBy(desc(resumePoolItem.createdAt), desc(resumePoolItem.id))
      .limit(options.poolLimit);
    const records: AvatarTargetRecord[] = poolRows.map((row) => ({
      ...row,
      source: "pool",
    }));

    for (const stage of recruitingPipelineNodeValues) {
      const stageRows = await db
        .select({
          candidateName: recruitingRecordReadModel.candidateName,
          contentHash: recruitingRecordReadModel.resumeContentHash,
          fileName: recruitingRecordReadModel.resumeFileName,
          recordId: recruitingRecordReadModel.id,
          storageKey: recruitingRecordReadModel.resumeStorageKey,
        })
        .from(recruitingRecordReadModel)
        .where(
          and(
            eq(recruitingRecordReadModel.organizationId, options.workspaceId),
            eq(recruitingRecordReadModel.pipelineStage, stage),
          ),
        )
        .orderBy(desc(recruitingRecordReadModel.createdAt), desc(recruitingRecordReadModel.id))
        .limit(options.stageLimit);
      records.push(...stageRows.map((row) => ({ ...row, source: stage })));
    }

    const { missingFile, targets } = groupAvatarTargets(records);
    const attempts = targets.length
      ? await db
          .select({
            attempts: resumeCandidateAvatar.attempts,
            contentHash: resumeCandidateAvatar.contentHash,
            status: resumeCandidateAvatar.status,
          })
          .from(resumeCandidateAvatar)
          .where(
            inArray(
              resumeCandidateAvatar.contentHash,
              targets.map((target) => target.contentHash),
            ),
          )
      : [];
    const attemptByHash = new Map(attempts.map((row) => [row.contentHash, row]));
    const classified = targets.map((target) => ({
      classification: classifyAvatarTarget(target, attemptByHash.get(target.contentHash)),
      target,
    }));
    const eligible = classified
      .filter((entry) => entry.classification === "eligible")
      .map((entry) => entry.target);

    console.info("[avatar-backfill] targets", {
      apply: options.apply,
      eligibleResumes: eligible.length,
      recordsBySource: countBy(records, (record) => record.source),
      recordsWithoutResumeFile: missingFile.length,
      resumesByClassification: countBy(classified, (entry) => entry.classification),
      uniqueResumes: targets.length,
      workspaceId: options.workspaceId,
    });
    if (!options.apply) {
      console.info("[avatar-backfill] dry run only; pass --apply to extract avatars.");
      return;
    }

    let completed = 0;
    await runWithConcurrency(eligible, options.concurrency, async (target) => {
      await ensureCandidateAvatar({
        contentHash: target.contentHash,
        fileName: target.fileName ?? undefined,
        loadBytes: async () => {
          const object = await getObjectBytes(target.storageKey);
          return object?.bytes ?? null;
        },
      });
      completed += 1;
      console.info("[avatar-backfill] processed", {
        candidate: target.records[0]?.candidateName,
        contentHash: target.contentHash.slice(0, 12),
        progress: `${completed}/${eligible.length}`,
      });
    });

    const results = eligible.length
      ? await db
          .select({ status: resumeCandidateAvatar.status })
          .from(resumeCandidateAvatar)
          .where(
            inArray(
              resumeCandidateAvatar.contentHash,
              eligible.map((target) => target.contentHash),
            ),
          )
      : [];
    console.info("[avatar-backfill] finished", {
      processed: eligible.length,
      resultsByStatus: countBy(results, (row) => row.status),
      withoutRecord: eligible.length - results.length,
    });
  } finally {
    await closeDatabase();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await backfillCandidateAvatars(parseBackfillCandidateAvatarOptions(process.argv.slice(2)));
}
