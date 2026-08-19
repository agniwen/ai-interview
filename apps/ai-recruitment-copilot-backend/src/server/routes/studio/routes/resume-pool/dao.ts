/* oxlint-disable max-lines -- resume-pool persistence keeps list/detail/write transactions co-located. */
import { and, asc, count, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  jobDescription,
  mailIngestMessage,
  member,
  organization,
  resumePoolEvent,
  resumePoolImport,
  resumePoolItem,
  resumeUploadBatchItem,
  studioInterview,
  user,
} from "@arc/db-schema/schema";
import type { ResumePoolEventType, ResumePoolScope, ResumePoolStatus } from "@arc/db-schema/schema";
import type { ResumeParseStatus } from "@arc/db-schema/studio-interviews";
import type { JsonValue } from "@arc/db-schema/json";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type { RecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
import type {
  PaginatedResumePoolResult,
  ResumePoolDetail,
  ResumePoolImportDuplicateMatchRecord,
  ResumePoolImportResult,
  ResumePoolSourceChannel,
  ResumePoolUploaderOption,
} from "@arc/shared/resume-pool";
import type { ResumeDuplicateMatchSummary } from "@arc/shared/resume-duplicates";
import { findSemanticResumeDuplicates } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/dedup-service";
import {
  deleteDuplicateMatchesForSource,
  listActiveDuplicateMatchCounts,
  replaceDuplicateMatchesForSource,
} from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/duplicate-matches";
import { enqueueResumeSemanticIndexJobBestEffort } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/enqueue";
import { loadResumeParseRetryEligibility } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-upload-batches/dao/retry";
import { deleteResumeSemanticIndexBestEffort } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/lifecycle";
import { cloneResumeSemanticIndexFromPoolToInterview } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/clone";
import { createResumeRecordFromStorage } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/create-from-storage";
import { normalizeSkill } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/skills";
import { loadBoundJobDescriptionName } from "./dao/job-description-name";
import { EMPTY_UPLOADER_META, toResumePoolDetail, toResumePoolListRecord } from "./dao/presenters";
import type { PoolUploaderMeta } from "./dao/presenters";
import { admitResumePoolItem } from "./utils/admission";

export { buildMasteredSkills, buildProfileHighlights } from "./dao/presenters";

type PoolRow = typeof resumePoolItem.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface CreateResumePoolItemInput {
  candidateEmail: string | null;
  candidateName: string | null;
  candidatePhone: string | null;
  contentHash: string | null;
  createdBy: string | null;
  jobDescriptionId: string | null;
  notes: string | null;
  organizationId: string | null;
  resumeFileName: string | null;
  resumeParseStatus?: ResumeParseStatus;
  resumeProfile: ResumeProfile | null;
  resumeText?: string | null;
  scope: ResumePoolScope;
  sourceChannel?: ResumePoolSourceChannel | null;
  storageKey: string | null;
  targetRole: string | null;
}

export interface MarkResumePoolItemParsedInput {
  actorId: string | null;
  jobDescriptionId?: string | null;
  notes?: string | null;
  organizationId: string | null;
  poolItemId: string;
  resumeParseStatus?: "processing" | "ready";
  resumeProfile: ResumeProfile | null;
  resumeText: string | null;
}

export interface MarkResumePoolItemStatusInput {
  errorMessage?: string | null;
  organizationId: string | null;
  poolItemId: string;
}

export interface QueryResumePoolItemsInput {
  creatorIds?: string[] | null;
  organizationId: string;
  scope: ResumePoolScope;
}

export interface PublishPrivatePoolItemInput {
  organizationId: string;
  poolItemId: string;
  userId: string;
}

export interface ImportPoolItemInput {
  dedupPolicy: "check" | "force";
  importedBy: string;
  jobDescriptionId: string | null;
  organizationId: string;
  poolItemId: string;
  reimport?: boolean;
}

export interface DeleteOwnPoolItemInput {
  organizationId: string;
  poolItemId: string;
  userId: string;
}

export interface BindResumePoolItemJobDescriptionInput {
  actorId: string | null;
  jobDescriptionId: string;
  organizationId: string;
  poolItemId: string;
}

function normalizeSkills(skills: readonly string[] | null | undefined): string[] {
  return [
    ...new Set(
      (skills ?? [])
        .map((skill) => normalizeSkill(skill).normalized)
        .filter((skill) => skill.length > 0),
    ),
  ];
}

function uploaderMetaFromRow(row: PoolUploaderMeta): PoolUploaderMeta {
  return {
    uploaderEmail: row.uploaderEmail,
    uploaderImage: row.uploaderImage,
    uploaderName: row.uploaderName,
    uploaderOrganizationName: row.uploaderOrganizationName,
  };
}

async function loadUploaderMeta(poolItemId: string): Promise<PoolUploaderMeta> {
  const [row] = await db
    .select({
      uploaderEmail: user.email,
      uploaderImage: user.image,
      uploaderName: user.name,
      uploaderOrganizationName: organization.name,
    })
    .from(resumePoolItem)
    .leftJoin(organization, eq(resumePoolItem.organizationId, organization.id))
    .leftJoin(user, eq(resumePoolItem.createdBy, user.id))
    .where(eq(resumePoolItem.id, poolItemId))
    .limit(1);
  return row ? uploaderMetaFromRow(row) : EMPTY_UPLOADER_META;
}

export async function listResumePoolUploaders(input: {
  organizationId: string;
  visibilityScope: RecruitingVisibilityScope;
}): Promise<ResumePoolUploaderOption[]> {
  if (
    input.visibilityScope.kind === "none" ||
    (input.visibilityScope.kind === "restricted" && input.visibilityScope.userIds.length === 0)
  ) {
    return [];
  }
  const visibilityCondition =
    input.visibilityScope.kind === "restricted"
      ? inArray(member.userId, input.visibilityScope.userIds)
      : undefined;
  return await db
    .select({
      email: user.email,
      id: user.id,
      image: user.image,
      name: user.name,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(and(eq(member.organizationId, input.organizationId), visibilityCondition))
    .orderBy(asc(user.name), asc(user.email));
}

async function writeResumePoolEvent(
  tx: Tx,
  input: {
    actorId: string | null;
    organizationId: string | null;
    payload?: JsonValue;
    poolItemId: string;
    type: ResumePoolEventType;
  },
) {
  await tx.insert(resumePoolEvent).values({
    actorId: input.actorId,
    id: crypto.randomUUID(),
    organizationId: input.organizationId,
    payload: input.payload,
    poolItemId: input.poolItemId,
    type: input.type,
  });
}

// oxlint-disable-next-line complexity -- central data mapper for pool rows.
export async function createResumePoolItem(input: CreateResumePoolItemInput): Promise<string> {
  const now = new Date();
  const id = crypto.randomUUID();
  const candidateName =
    input.candidateName?.trim() ||
    input.resumeProfile?.name ||
    input.resumeFileName ||
    "未命名简历";
  let resumeParseStatus: ResumeParseStatus = "unparsed";
  if (input.resumeProfile) {
    resumeParseStatus = input.resumeParseStatus ?? "ready";
  }
  // oxlint-disable-next-line complexity -- central data mapper for pool rows.
  await db.transaction(async (tx) => {
    await tx.insert(resumePoolItem).values({
      candidateEmail: input.candidateEmail?.trim() || input.resumeProfile?.email || null,
      candidateName,
      candidatePhone: input.candidatePhone?.trim() || input.resumeProfile?.phone || null,
      createdAt: now,
      createdBy: input.createdBy,
      id,
      jobDescriptionId: input.jobDescriptionId,
      notes: input.notes,
      organizationId: input.organizationId,
      publishedAt: input.scope === "public" ? now : null,
      publishedBy: input.scope === "public" ? input.createdBy : null,
      resumeContentHash: input.contentHash,
      resumeFileName: input.resumeFileName,
      resumeParseError: null,
      resumeParseStatus,
      resumeParsedAt: resumeParseStatus === "ready" ? now : null,
      resumeProfile: input.resumeProfile,
      resumeStorageKey: input.storageKey,
      resumeText: input.resumeText ?? null,
      scope: input.scope,
      skillsNormalized: normalizeSkills(input.resumeProfile?.skills),
      sourceChannel: input.sourceChannel ?? null,
      sourceOrganizationId: input.scope === "public" ? input.organizationId : null,
      sourcePoolItemId: null,
      sourceUserId: input.scope === "public" ? input.createdBy : null,
      status: "active" satisfies ResumePoolStatus,
      targetRole: input.targetRole?.trim() || input.resumeProfile?.targetRoles?.[0] || null,
      updatedAt: now,
    });
    await writeResumePoolEvent(tx, {
      actorId: input.createdBy,
      organizationId: input.organizationId,
      poolItemId: id,
      type: "created",
    });
  });
  return id;
}

export async function markResumePoolItemParsed(
  input: MarkResumePoolItemParsedInput,
): Promise<void> {
  const [row] = await db
    .select()
    .from(resumePoolItem)
    .where(eq(resumePoolItem.id, input.poolItemId))
    .limit(1);
  if (!row) {
    return;
  }
  const now = new Date();
  const resumeParseStatus = input.resumeParseStatus ?? "ready";
  await db.transaction(async (tx) => {
    await tx
      .update(resumePoolItem)
      .set({
        candidateEmail: input.resumeProfile?.email ?? row.candidateEmail,
        candidateName: input.resumeProfile?.name || row.candidateName,
        candidatePhone: input.resumeProfile?.phone ?? row.candidatePhone,
        jobDescriptionId: input.jobDescriptionId ?? row.jobDescriptionId,
        notes: input.notes ?? row.notes,
        resumeParseError: null,
        resumeParseStatus,
        resumeParsedAt: resumeParseStatus === "ready" ? now : null,
        resumeProfile: input.resumeProfile,
        resumeText: input.resumeText,
        skillsNormalized: normalizeSkills(input.resumeProfile?.skills),
        targetRole:
          row.sourceChannel === "referral"
            ? row.targetRole
            : input.resumeProfile?.targetRoles?.[0] || row.targetRole,
        updatedAt: now,
      })
      .where(eq(resumePoolItem.id, input.poolItemId));
    await writeResumePoolEvent(tx, {
      actorId: input.actorId,
      organizationId: input.organizationId,
      poolItemId: input.poolItemId,
      type: "parsed",
    });
  });
}

export async function markResumePoolItemSemanticIndexed(
  input: MarkResumePoolItemStatusInput,
): Promise<void> {
  await db
    .update(resumePoolItem)
    .set({
      resumeParseError: null,
      resumeParseStatus: "ready",
      resumeParsedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(resumePoolItem.id, input.poolItemId),
        input.organizationId ? eq(resumePoolItem.organizationId, input.organizationId) : undefined,
      ),
    );
}

export async function markResumePoolItemParseFailed(
  input: MarkResumePoolItemStatusInput,
): Promise<void> {
  await db
    .update(resumePoolItem)
    .set({
      resumeParseError: input.errorMessage ?? "简历语义索引失败。",
      resumeParseStatus: "failed",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(resumePoolItem.id, input.poolItemId),
        input.organizationId ? eq(resumePoolItem.organizationId, input.organizationId) : undefined,
      ),
    );
}

function accessibleWhere(poolItemId: string) {
  return and(eq(resumePoolItem.id, poolItemId), eq(resumePoolItem.status, "active"));
}

function isPublicPoolItemInOrganization(row: PoolRow, organizationId: string): boolean {
  return row.scope === "public" && row.organizationId === organizationId;
}

async function loadAccessiblePoolItem(input: {
  organizationId: string;
  poolItemId: string;
  userId: string;
}): Promise<PoolRow | null> {
  const [row] = await db
    .select()
    .from(resumePoolItem)
    .where(accessibleWhere(input.poolItemId))
    .limit(1);
  if (!row) {
    return null;
  }
  // Public pool is workspace-scoped: any member with access may use same-org public items.
  if (isPublicPoolItemInOrganization(row, input.organizationId)) {
    return row;
  }
  if (row.organizationId === input.organizationId && row.createdBy === input.userId) {
    return row;
  }
  return null;
}

async function loadVisiblePoolItem(input: {
  organizationId: string;
  poolItemId: string;
  visibilityScope: RecruitingVisibilityScope;
}): Promise<PoolRow | null> {
  const [row] = await db
    .select()
    .from(resumePoolItem)
    .where(accessibleWhere(input.poolItemId))
    .limit(1);
  if (!row) {
    return null;
  }
  // Public pool is workspace-scoped (not app-wide). Same-org members can read it.
  if (isPublicPoolItemInOrganization(row, input.organizationId)) {
    return row;
  }
  if (row.organizationId !== input.organizationId || !row.createdBy) {
    return null;
  }
  if (input.visibilityScope.kind === "all") {
    return row;
  }
  if (
    input.visibilityScope.kind === "restricted" &&
    input.visibilityScope.userIds.includes(row.createdBy)
  ) {
    return row;
  }
  return null;
}

async function loadImportsForOrg(
  poolItemId: string,
  organizationId: string,
): Promise<
  {
    creatorImage: string | null;
    creatorName: string | null;
    importedAt: Date;
    resumeRecordId: string;
  }[]
> {
  return await db
    .select({
      creatorImage: user.image,
      creatorName: user.name,
      importedAt: resumePoolImport.importedAt,
      resumeRecordId: resumePoolImport.importedResumeRecordId,
    })
    .from(resumePoolImport)
    .leftJoin(user, eq(resumePoolImport.importedBy, user.id))
    .where(
      and(
        eq(resumePoolImport.poolItemId, poolItemId),
        eq(resumePoolImport.organizationId, organizationId),
      ),
    )
    .orderBy(desc(resumePoolImport.importedAt), desc(resumePoolImport.id));
}

async function loadSourceChannels(
  poolItemIds: string[],
): Promise<Map<string, ResumePoolSourceChannel>> {
  if (poolItemIds.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({ poolItemId: resumeUploadBatchItem.poolItemId })
    .from(resumeUploadBatchItem)
    .innerJoin(mailIngestMessage, eq(mailIngestMessage.batchId, resumeUploadBatchItem.batchId))
    .where(
      and(
        inArray(resumeUploadBatchItem.poolItemId, poolItemIds),
        eq(mailIngestMessage.status, "queued"),
      ),
    );
  return new Map(
    rows
      .filter((row): row is { poolItemId: string } => row.poolItemId !== null)
      .map((row) => [row.poolItemId, "mail_ingest" as const]),
  );
}

function toDuplicateMatchSummary(
  value: { count: number; highestLevel: "high" | "low" | "medium" | null } | undefined,
): ResumeDuplicateMatchSummary | null {
  return value && value.count > 0 ? { count: value.count, highestLevel: value.highestLevel } : null;
}

async function loadPoolDuplicateMatches(input: {
  organizationId: string;
  rows: PoolRow[];
}): Promise<Map<string, ResumeDuplicateMatchSummary>> {
  const sourceIds = input.rows
    .filter((row) => row.organizationId === input.organizationId)
    .map((row) => row.id);
  const counts = await listActiveDuplicateMatchCounts({
    organizationId: input.organizationId,
    sourceIds,
    sourceType: "resume_pool_item",
  });
  return new Map(
    [...counts.entries()]
      .map(([id, value]) => [id, toDuplicateMatchSummary(value)] as const)
      .filter(
        (entry): entry is readonly [string, ResumeDuplicateMatchSummary] => entry[1] !== null,
      ),
  );
}

export async function queryResumePoolItems(
  input: QueryResumePoolItemsInput,
): Promise<PaginatedResumePoolResult> {
  if (input.scope === "private" && input.creatorIds?.length === 0) {
    return { records: [], total: 0 };
  }
  const where =
    input.scope === "private"
      ? and(
          eq(resumePoolItem.scope, "private"),
          eq(resumePoolItem.status, "active"),
          eq(resumePoolItem.organizationId, input.organizationId),
          input.creatorIds ? inArray(resumePoolItem.createdBy, input.creatorIds) : undefined,
        )
      : and(
          eq(resumePoolItem.scope, "public"),
          eq(resumePoolItem.status, "active"),
          // Public pool shares within the workspace only — never across organizations.
          eq(resumePoolItem.organizationId, input.organizationId),
        );

  const [totalRow] = await db.select({ total: count() }).from(resumePoolItem).where(where);
  const rows = await db
    .select({
      item: resumePoolItem,
      jobDescriptionName: jobDescription.name,
      uploaderEmail: user.email,
      uploaderImage: user.image,
      uploaderName: user.name,
      uploaderOrganizationName: organization.name,
    })
    .from(resumePoolItem)
    .leftJoin(organization, eq(resumePoolItem.organizationId, organization.id))
    .leftJoin(user, eq(resumePoolItem.createdBy, user.id))
    .leftJoin(
      jobDescription,
      and(
        eq(resumePoolItem.jobDescriptionId, jobDescription.id),
        eq(jobDescription.organizationId, input.organizationId),
      ),
    )
    .where(where)
    .orderBy(desc(resumePoolItem.createdAt))
    .limit(100);
  const imports = await Promise.all(
    rows.map((row) => loadImportsForOrg(row.item.id, input.organizationId)),
  );
  const [sourceChannels, duplicateMatches, retryableIds] = await Promise.all([
    loadSourceChannels(rows.map((row) => row.item.id)),
    loadPoolDuplicateMatches({
      organizationId: input.organizationId,
      rows: rows.map((row) => row.item),
    }),
    loadResumeParseRetryEligibility({
      ids: rows.map((row) => row.item.id),
      organizationId: input.organizationId,
      target: "resume_pool",
    }),
  ]);
  return {
    records: rows.map((row, index) =>
      toResumePoolListRecord(
        row.item,
        imports[index] ?? [],
        uploaderMetaFromRow(row),
        sourceChannels.get(row.item.id) ?? null,
        duplicateMatches.get(row.item.id) ?? null,
        row.jobDescriptionName ?? null,
        row.item.resumeParseStatus === "failed" &&
          Boolean(row.item.resumeStorageKey) &&
          (retryableIds.get(row.item.id) ?? true),
      ),
    ),
    total: totalRow?.total ?? 0,
  };
}

export async function loadResumePoolItem(
  input: {
    organizationId: string;
    poolItemId: string;
  } & (
    | { userId: string; visibilityScope?: never }
    | { userId?: never; visibilityScope: RecruitingVisibilityScope }
  ),
): Promise<ResumePoolDetail | null> {
  const row = input.visibilityScope
    ? await loadVisiblePoolItem({
        organizationId: input.organizationId,
        poolItemId: input.poolItemId,
        visibilityScope: input.visibilityScope,
      })
    : await loadAccessiblePoolItem({
        organizationId: input.organizationId,
        poolItemId: input.poolItemId,
        userId: input.userId,
      });
  if (!row) {
    return null;
  }
  const [importRows, uploaderMeta, duplicateMatches, jobDescriptionName, retryableIds] =
    await Promise.all([
      loadImportsForOrg(row.id, input.organizationId),
      loadUploaderMeta(row.id),
      loadPoolDuplicateMatches({
        organizationId: input.organizationId,
        rows: [row],
      }),
      loadBoundJobDescriptionName(row.jobDescriptionId, input.organizationId),
      loadResumeParseRetryEligibility({
        ids: [row.id],
        organizationId: input.organizationId,
        target: "resume_pool",
      }),
    ]);
  const sourceChannels = await loadSourceChannels([row.id]);
  return toResumePoolDetail(
    row,
    importRows,
    uploaderMeta,
    sourceChannels.get(row.id) ?? null,
    duplicateMatches.get(row.id) ?? null,
    jobDescriptionName,
    row.resumeParseStatus === "failed" &&
      Boolean(row.resumeStorageKey) &&
      (retryableIds.get(row.id) ?? true),
  );
}

export interface PublishPrivatePoolItemDependencies {
  enqueueSemanticIndex: typeof enqueueResumeSemanticIndexJobBestEffort;
}

const defaultPublishPrivatePoolItemDependencies: PublishPrivatePoolItemDependencies = {
  enqueueSemanticIndex: enqueueResumeSemanticIndexJobBestEffort,
};

export async function publishPrivatePoolItem(
  input: PublishPrivatePoolItemInput,
  dependencies = defaultPublishPrivatePoolItemDependencies,
): Promise<ResumePoolDetail> {
  const privateItem = await loadAccessiblePoolItem(input);
  if (!privateItem || privateItem.scope !== "private") {
    throw new Error("简历池记录不存在或无权访问");
  }
  if (privateItem.resumeParseStatus !== "ready") {
    throw new Error("简历解析完成后才能推送到公共简历池");
  }

  const now = new Date();
  const publicId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(resumePoolItem).values({
      candidateEmail: privateItem.candidateEmail,
      candidateName: privateItem.candidateName,
      candidatePhone: privateItem.candidatePhone,
      createdAt: now,
      createdBy: input.userId,
      id: publicId,
      jobDescriptionId: null,
      notes: privateItem.notes,
      organizationId: input.organizationId,
      publishedAt: now,
      publishedBy: input.userId,
      resumeContentHash: privateItem.resumeContentHash,
      resumeFileName: privateItem.resumeFileName,
      resumeParseError: privateItem.resumeParseError,
      resumeParseStatus: privateItem.resumeParseStatus,
      resumeParsedAt: privateItem.resumeParsedAt,
      resumeProfile: privateItem.resumeProfile,
      resumeStorageKey: privateItem.resumeStorageKey,
      resumeText: privateItem.resumeText,
      scope: "public",
      skillsNormalized: privateItem.skillsNormalized,
      sourceChannel: privateItem.sourceChannel,
      sourceOrganizationId: input.organizationId,
      sourcePoolItemId: privateItem.id,
      sourceUserId: input.userId,
      status: "active",
      targetRole: privateItem.targetRole,
      updatedAt: now,
    });
    await writeResumePoolEvent(tx, {
      actorId: input.userId,
      organizationId: input.organizationId,
      payload: { publicPoolItemId: publicId },
      poolItemId: privateItem.id,
      type: "published",
    });
    await writeResumePoolEvent(tx, {
      actorId: input.userId,
      organizationId: input.organizationId,
      payload: { sourcePoolItemId: privateItem.id },
      poolItemId: publicId,
      type: "created",
    });
  });

  const publicItem = await loadResumePoolItem({
    organizationId: input.organizationId,
    poolItemId: publicId,
    userId: input.userId,
  });
  if (!publicItem) {
    throw new Error("公共简历池记录创建失败");
  }
  await dependencies.enqueueSemanticIndex({
    organizationId: input.organizationId,
    sourceId: publicItem.id,
    sourceType: "resume_pool_item",
  });
  return publicItem;
}

export interface ImportPoolItemDependencies {
  cloneSemanticIndex: typeof cloneResumeSemanticIndexFromPoolToInterview;
  findDuplicateMatches: typeof findSemanticResumeDuplicates;
}

const defaultImportPoolItemDependencies: ImportPoolItemDependencies = {
  cloneSemanticIndex: cloneResumeSemanticIndexFromPoolToInterview,
  findDuplicateMatches: findSemanticResumeDuplicates,
};

export async function importPoolItemToResumeLibrary(
  input: ImportPoolItemInput,
  dependencies = defaultImportPoolItemDependencies,
): Promise<ResumePoolImportResult> {
  const result = await admitResumePoolItem<PoolRow, ResumePoolImportDuplicateMatchRecord>(input, {
    cloneSemanticIndex: (admission) =>
      dependencies.cloneSemanticIndex({
        poolItemId: admission.poolItemId,
        resumeRecordId: admission.resumeRecordId,
        sourceOrganizationId: admission.sourceOrganizationId,
        targetOrganizationId: admission.organizationId,
      }),
    ensureAdmissionRecord: async ({ admission, source }) => {
      let resumeRecordId = "";
      await db.transaction(async (tx) => {
        const lockKey = `resume-pool-import:${admission.organizationId}:${source.id}`;
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
        if (!admission.reimport) {
          const [existing] = await tx
            .select({ resumeRecordId: resumePoolImport.importedResumeRecordId })
            .from(resumePoolImport)
            .where(
              and(
                eq(resumePoolImport.poolItemId, source.id),
                eq(resumePoolImport.organizationId, admission.organizationId),
              ),
            )
            .orderBy(desc(resumePoolImport.importedAt))
            .limit(1);
          if (existing) {
            ({ resumeRecordId } = existing);
            await tx
              .update(studioInterview)
              .set({
                jobDescriptionId: admission.jobDescriptionId,
                resumeParseError: null,
                resumeParseStatus: "processing",
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(studioInterview.id, resumeRecordId),
                  eq(studioInterview.organizationId, admission.organizationId),
                  ne(studioInterview.resumeParseStatus, "ready"),
                ),
              );
            return;
          }
        }

        const importedAt = new Date();
        resumeRecordId = await createResumeRecordFromStorage(
          {
            candidateEmail: source.candidateEmail,
            candidateName: source.candidateName,
            candidatePhone: source.candidatePhone,
            contentHash: source.resumeContentHash,
            jobDescriptionId: admission.jobDescriptionId,
            notes: source.notes,
            organizationId: admission.organizationId,
            resumeFileName: source.resumeFileName,
            resumeParseStatus: "processing",
            resumeProfile: source.resumeProfile,
            resumeText: source.resumeText,
            source: {
              importedAt,
              importedBy: admission.importedBy,
              poolItemId: source.id,
              type: source.scope === "public" ? "public_pool" : "private_pool",
            },
            storageKey: source.resumeStorageKey,
            targetRole: source.targetRole,
            userId: admission.importedBy,
          },
          tx,
        );
        await tx.insert(resumePoolImport).values({
          id: crypto.randomUUID(),
          importedAt,
          importedBy: admission.importedBy,
          importedResumeRecordId: resumeRecordId,
          organizationId: admission.organizationId,
          poolItemId: source.id,
        });
        await writeResumePoolEvent(tx, {
          actorId: admission.importedBy,
          organizationId: admission.organizationId,
          payload: { resumeRecordId },
          poolItemId: source.id,
          type: "imported",
        });
      });
      return resumeRecordId;
    },
    findDuplicateMatches: async ({ admission, existingResumeRecordId, source }) => {
      const matches = await dependencies.findDuplicateMatches({
        email: source.candidateEmail ?? source.resumeProfile?.email ?? null,
        excludeSources: existingResumeRecordId
          ? [{ sourceId: existingResumeRecordId, sourceType: "studio_interview" }]
          : undefined,
        name: source.candidateName ?? source.resumeProfile?.name ?? null,
        organizationId: admission.organizationId,
        phone: source.candidatePhone ?? source.resumeProfile?.phone ?? null,
        resumeProfile: source.resumeProfile,
        sourceTypes: ["studio_interview"],
      });
      return matches;
    },
    loadExistingAdmissionRecord: async (admission) => {
      const [existing] = await db
        .select({ resumeRecordId: resumePoolImport.importedResumeRecordId })
        .from(resumePoolImport)
        .where(
          and(
            eq(resumePoolImport.poolItemId, admission.poolItemId),
            eq(resumePoolImport.organizationId, admission.organizationId),
          ),
        )
        .orderBy(desc(resumePoolImport.importedAt))
        .limit(1);
      return existing?.resumeRecordId ?? null;
    },
    loadSource: (admission) =>
      loadAccessiblePoolItem({
        organizationId: admission.organizationId,
        poolItemId: admission.poolItemId,
        userId: admission.importedBy,
      }),
    markAdmissionFailed: async (admission) => {
      await db
        .update(studioInterview)
        .set({
          resumeParseError: admission.errorMessage.slice(0, 1000),
          resumeParseStatus: "failed",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(studioInterview.id, admission.resumeRecordId),
            eq(studioInterview.organizationId, admission.organizationId),
            ne(studioInterview.resumeParseStatus, "ready"),
          ),
        );
    },
    markAdmissionReady: async (admission) => {
      const now = new Date();
      await db
        .update(studioInterview)
        .set({
          resumeParseError: null,
          resumeParseStatus: "ready",
          resumeParsedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(studioInterview.id, admission.resumeRecordId),
            eq(studioInterview.organizationId, admission.organizationId),
          ),
        );
    },
    replaceDuplicateSnapshot: async (admission) => {
      await replaceDuplicateMatchesForSource({
        matches: admission.matches,
        organizationId: admission.organizationId,
        sourceId: admission.resumeRecordId,
        sourceType: "studio_interview",
      });
    },
  });
  if (result.status === "imported" && input.jobDescriptionId) {
    await db.transaction(async (tx) => {
      await tx
        .update(resumePoolItem)
        .set({ jobDescriptionId: input.jobDescriptionId, updatedAt: new Date() })
        .where(
          and(
            eq(resumePoolItem.id, input.poolItemId),
            eq(resumePoolItem.organizationId, input.organizationId),
          ),
        );
      await writeResumePoolEvent(tx, {
        actorId: input.importedBy,
        organizationId: input.organizationId,
        payload: { jobDescriptionId: input.jobDescriptionId },
        poolItemId: input.poolItemId,
        type: "bound",
      });
    });
  }
  return result;
}

export interface DeleteOwnPoolItemDependencies {
  deleteSemanticIndex: typeof deleteResumeSemanticIndexBestEffort;
}

const defaultDeleteOwnPoolItemDependencies: DeleteOwnPoolItemDependencies = {
  deleteSemanticIndex: deleteResumeSemanticIndexBestEffort,
};

export async function deleteOwnPoolItem(
  input: DeleteOwnPoolItemInput,
  dependencies = defaultDeleteOwnPoolItemDependencies,
): Promise<void> {
  const deleted = await db
    .delete(resumePoolItem)
    .where(
      and(
        eq(resumePoolItem.id, input.poolItemId),
        eq(resumePoolItem.status, "active"),
        eq(resumePoolItem.organizationId, input.organizationId),
        eq(resumePoolItem.createdBy, input.userId),
      ),
    )
    .returning({ id: resumePoolItem.id });

  if (deleted.length === 0) {
    throw new Error("简历不存在或无权删除");
  }
  await dependencies.deleteSemanticIndex({
    sourceId: input.poolItemId,
    sourceType: "resume_pool_item",
  });
  await deleteDuplicateMatchesForSource({
    organizationId: input.organizationId,
    sourceId: input.poolItemId,
    sourceType: "resume_pool_item",
  });
}

/**
 * Bind a pool item to a job description exactly once. The WHERE clause only
 * matches rows that are not yet bound, so concurrent calls race on the same
 * UPDATE: the first writer wins and the second updates zero rows.
 */
export async function bindResumePoolItemJobDescription(
  input: BindResumePoolItemJobDescriptionInput,
): Promise<boolean> {
  return await db.transaction(async (tx) => {
    const updated = await tx
      .update(resumePoolItem)
      .set({ jobDescriptionId: input.jobDescriptionId, updatedAt: new Date() })
      .where(
        and(
          eq(resumePoolItem.id, input.poolItemId),
          eq(resumePoolItem.organizationId, input.organizationId),
          isNull(resumePoolItem.jobDescriptionId),
        ),
      )
      .returning({ id: resumePoolItem.id });
    if (updated.length === 0) {
      return false;
    }
    await writeResumePoolEvent(tx, {
      actorId: input.actorId,
      organizationId: input.organizationId,
      payload: { jobDescriptionId: input.jobDescriptionId },
      poolItemId: input.poolItemId,
      type: "bound",
    });
    return true;
  });
}
