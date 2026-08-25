/* oxlint-disable max-lines -- resume-pool persistence keeps list/detail/write transactions co-located. */
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gte,
  inArray,
  isNull,
  lt,
  ne,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import type { SQL, SQLWrapper } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  jobDescription,
  mailIngestMessage,
  member,
  organization,
  resumePoolEvent,
  resumePoolImport,
  resumePoolItem,
  resumeJobMatchCandidate,
  resumeJobMatchRun,
  resumeUploadBatchItem,
  studioInterview,
  user,
} from "@arc/db-schema/schema";
import type { ResumePoolEventType, ResumePoolScope, ResumePoolStatus } from "@arc/db-schema/schema";
import type { ResumeParseStatus } from "@arc/db-schema/studio-interviews";
import type { JsonObject } from "@arc/db-schema/json";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type { RecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
import type {
  PaginatedResumePoolResult,
  ResumePoolDetail,
  ResumePoolImportDuplicateMatchRecord,
  ResumePoolImportResult,
  ResumePoolInitialRecruitmentStage,
  ResumePoolJobBindingMode,
  ResumePoolJobMatchResult,
  ResumePoolSourceChannel,
  ResumePoolUploaderOption,
} from "@arc/shared/resume-pool";
import type { ResumeDuplicateMatchSummary } from "@arc/shared/resume-duplicates";
import { findSemanticResumeDuplicates } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/dedup-service";
import {
  deleteDuplicateMatchesForSource,
  listActiveDuplicateSummariesAgainstStudioInterviews,
  replaceDuplicateMatchesForSource,
} from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/duplicate-matches";
import { enqueueResumeSemanticIndexJobBestEffort } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/enqueue";
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
  jobBindingMode?: ResumePoolJobBindingMode | null;
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
  createdAtBefore?: Date;
  createdAtFrom?: Date;
  creatorIds?: string[] | null;
  importStatus?: "imported" | "not_imported";
  limit?: number;
  offset?: number;
  organizationId: string;
  search?: string;
  sortBy?: "candidateName" | "createdAt" | "updatedAt";
  sortOrder?: "asc" | "desc";
  scope: ResumePoolScope;
  sourceType?: "all" | "non_referral" | "referral";
}

export interface PublishPrivatePoolItemInput {
  organizationId: string;
  poolItemId: string;
  userId: string;
}

export interface ImportPoolItemInput {
  dedupPolicy: "check" | "force";
  importedBy: string;
  initialRecruitmentStage?: ResumePoolInitialRecruitmentStage;
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
    payload?: JsonObject;
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

function jobBindingModeFromEventPayload(
  payload: JsonObject | null,
): ResumePoolJobBindingMode | null {
  if (payload?.bindingMode === "automatic" || payload?.bindingMode === "manual") {
    return payload.bindingMode;
  }
  return null;
}

async function loadJobBindingModes(
  poolItemIds: readonly string[],
): Promise<Map<string, ResumePoolJobBindingMode>> {
  if (poolItemIds.length === 0) {
    return new Map();
  }
  const events = await db
    .select({ payload: resumePoolEvent.payload, poolItemId: resumePoolEvent.poolItemId })
    .from(resumePoolEvent)
    .where(
      and(inArray(resumePoolEvent.poolItemId, [...poolItemIds]), eq(resumePoolEvent.type, "bound")),
    )
    .orderBy(desc(resumePoolEvent.createdAt), desc(resumePoolEvent.id));
  const modes = new Map<string, ResumePoolJobBindingMode>();
  const seenPoolItemIds = new Set<string>();
  for (const event of events) {
    if (seenPoolItemIds.has(event.poolItemId)) {
      continue;
    }
    seenPoolItemIds.add(event.poolItemId);
    const mode = jobBindingModeFromEventPayload(event.payload);
    if (mode) {
      modes.set(event.poolItemId, mode);
    }
  }
  return modes;
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
    if (input.jobDescriptionId && input.jobBindingMode) {
      await writeResumePoolEvent(tx, {
        actorId: input.createdBy,
        organizationId: input.organizationId,
        payload: {
          bindingMode: input.jobBindingMode,
          fromJobDescriptionId: null,
          source: "created_with_job",
          toJobDescriptionId: input.jobDescriptionId,
        },
        poolItemId: id,
        type: "bound",
      });
    }
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

async function loadImportsForPoolItems(
  poolItemIds: string[],
  organizationId: string,
): Promise<
  Map<
    string,
    {
      creatorImage: string | null;
      creatorName: string | null;
      importedAt: Date;
      resumeRecordId: string;
    }[]
  >
> {
  if (poolItemIds.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({
      creatorImage: user.image,
      creatorName: user.name,
      importedAt: resumePoolImport.importedAt,
      poolItemId: resumePoolImport.poolItemId,
      resumeRecordId: resumePoolImport.importedResumeRecordId,
    })
    .from(resumePoolImport)
    .leftJoin(user, eq(resumePoolImport.importedBy, user.id))
    .where(
      and(
        inArray(resumePoolImport.poolItemId, poolItemIds),
        eq(resumePoolImport.organizationId, organizationId),
      ),
    )
    .orderBy(desc(resumePoolImport.importedAt), desc(resumePoolImport.id));
  const imports = new Map<
    string,
    {
      creatorImage: string | null;
      creatorName: string | null;
      importedAt: Date;
      resumeRecordId: string;
    }[]
  >();
  for (const row of rows) {
    const current = imports.get(row.poolItemId) ?? [];
    current.push({
      creatorImage: row.creatorImage,
      creatorName: row.creatorName,
      importedAt: row.importedAt,
      resumeRecordId: row.resumeRecordId,
    });
    imports.set(row.poolItemId, current);
  }
  return imports;
}

function buildResumePoolImportStatusWhere(
  importStatus: QueryResumePoolItemsInput["importStatus"],
  organizationId: string,
): SQL | undefined {
  if (!importStatus) {
    return undefined;
  }
  const importsForItem = db
    .select({ id: resumePoolImport.id })
    .from(resumePoolImport)
    .where(
      and(
        eq(resumePoolImport.poolItemId, resumePoolItem.id),
        eq(resumePoolImport.organizationId, organizationId),
      ),
    );
  return importStatus === "imported" ? exists(importsForItem) : notExists(importsForItem);
}

function resumePoolListOrder(input: QueryResumePoolItemsInput): [SQL, SQL] {
  const ascending = input.sortOrder === "asc";
  const idOrder = ascending ? asc(resumePoolItem.id) : desc(resumePoolItem.id);
  if (input.sortBy === "candidateName") {
    return [
      ascending ? asc(resumePoolItem.candidateName) : desc(resumePoolItem.candidateName),
      idOrder,
    ];
  }
  if (input.sortBy === "updatedAt") {
    return [ascending ? asc(resumePoolItem.updatedAt) : desc(resumePoolItem.updatedAt), idOrder];
  }
  return [ascending ? asc(resumePoolItem.createdAt) : desc(resumePoolItem.createdAt), idOrder];
}

function literalLikePattern(value: string) {
  return `%${value.replaceAll(/[!%_]/g, "!$&")}%`;
}

function literalIlike(column: SQLWrapper, pattern: string): SQL {
  return sql`${column} ILIKE ${pattern} ESCAPE '!'`;
}

function resumePoolSearchWhere(search: string): SQL | undefined {
  const pattern = literalLikePattern(search);
  return or(
    literalIlike(resumePoolItem.candidateName, pattern),
    literalIlike(resumePoolItem.candidateEmail, pattern),
    literalIlike(resumePoolItem.candidatePhone, pattern),
    literalIlike(resumePoolItem.resumeFileName, pattern),
    literalIlike(resumePoolItem.targetRole, pattern),
  );
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

async function loadPoolDuplicateMatches(input: {
  organizationId: string;
  rows: PoolRow[];
}): Promise<Map<string, ResumeDuplicateMatchSummary>> {
  const sourceIds = input.rows
    .filter((row) => row.organizationId === input.organizationId)
    .map((row) => row.id);
  const summaries = await listActiveDuplicateSummariesAgainstStudioInterviews({
    organizationId: input.organizationId,
    sourceIds,
    sourceType: "resume_pool_item",
  });
  return new Map([...summaries.entries()].filter(([, summary]) => summary.highestLevel === "high"));
}

export async function queryResumePoolItems(
  input: QueryResumePoolItemsInput,
): Promise<PaginatedResumePoolResult> {
  if (input.scope === "private" && input.creatorIds?.length === 0) {
    return { records: [], total: 0 };
  }
  const scopeWhere =
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

  const where = and(
    scopeWhere,
    input.createdAtFrom ? gte(resumePoolItem.createdAt, input.createdAtFrom) : undefined,
    input.createdAtBefore ? lt(resumePoolItem.createdAt, input.createdAtBefore) : undefined,
    input.creatorIds && input.scope === "public"
      ? inArray(resumePoolItem.createdBy, input.creatorIds)
      : undefined,
    input.sourceType === "referral" ? eq(resumePoolItem.sourceChannel, "referral") : undefined,
    input.sourceType === "non_referral"
      ? or(isNull(resumePoolItem.sourceChannel), ne(resumePoolItem.sourceChannel, "referral"))
      : undefined,
    buildResumePoolImportStatusWhere(input.importStatus, input.organizationId),
    input.search ? resumePoolSearchWhere(input.search) : undefined,
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
    .orderBy(...resumePoolListOrder(input))
    .limit(input.limit ?? 60)
    .offset(input.offset ?? 0);
  const imports = await loadImportsForPoolItems(
    rows.map((row) => row.item.id),
    input.organizationId,
  );
  const [sourceChannels, duplicateMatches, jobBindingModes] = await Promise.all([
    loadSourceChannels(rows.map((row) => row.item.id)),
    loadPoolDuplicateMatches({
      organizationId: input.organizationId,
      rows: rows.map((row) => row.item),
    }),
    loadJobBindingModes(rows.map((row) => row.item.id)),
  ]);
  return {
    records: rows.map((row) =>
      toResumePoolListRecord(
        row.item,
        imports.get(row.item.id) ?? [],
        uploaderMetaFromRow(row),
        sourceChannels.get(row.item.id) ?? null,
        duplicateMatches.get(row.item.id) ?? null,
        row.jobDescriptionName ?? null,
        row.item.resumeParseStatus === "failed",
        jobBindingModes.get(row.item.id) ?? null,
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
  const [importRows, uploaderMeta, duplicateMatches, jobDescriptionName] = await Promise.all([
    loadImportsForOrg(row.id, input.organizationId),
    loadUploaderMeta(row.id),
    loadPoolDuplicateMatches({
      organizationId: input.organizationId,
      rows: [row],
    }),
    loadBoundJobDescriptionName(row.jobDescriptionId, input.organizationId),
  ]);
  const [sourceChannels, jobBindingModes] = await Promise.all([
    loadSourceChannels([row.id]),
    loadJobBindingModes([row.id]),
  ]);
  return toResumePoolDetail(
    row,
    importRows,
    uploaderMeta,
    sourceChannels.get(row.id) ?? null,
    duplicateMatches.get(row.id) ?? null,
    jobDescriptionName,
    row.resumeParseStatus === "failed",
    jobBindingModes.get(row.id) ?? null,
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

function resolveImportedRecordPipelineStage(
  initialRecruitmentStage: ResumePoolInitialRecruitmentStage | undefined,
) {
  return initialRecruitmentStage === "human_interview" ? "human_interview" : "screening";
}

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
        const pipelineStage = resolveImportedRecordPipelineStage(admission.initialRecruitmentStage);
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
                pipelineStage,
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
            pipelineStage,
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
        payload: { bindingMode: "manual", jobDescriptionId: input.jobDescriptionId },
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
    const [current] = await tx
      .select({ jobDescriptionId: resumePoolItem.jobDescriptionId })
      .from(resumePoolItem)
      .where(
        and(
          eq(resumePoolItem.id, input.poolItemId),
          eq(resumePoolItem.organizationId, input.organizationId),
        ),
      )
      .for("update")
      .limit(1);
    if (!current) {
      return false;
    }
    if (current.jobDescriptionId === input.jobDescriptionId) {
      return true;
    }
    const [latestRun] = await tx
      .select({ id: resumeJobMatchRun.id })
      .from(resumeJobMatchRun)
      .where(
        and(
          eq(resumeJobMatchRun.poolItemId, input.poolItemId),
          eq(resumeJobMatchRun.organizationId, input.organizationId),
        ),
      )
      .orderBy(desc(resumeJobMatchRun.createdAt))
      .limit(1);
    const [candidate] = latestRun
      ? await tx
          .select({
            aiRank: resumeJobMatchCandidate.aiRank,
            recallRank: resumeJobMatchCandidate.recallRank,
          })
          .from(resumeJobMatchCandidate)
          .where(
            and(
              eq(resumeJobMatchCandidate.runId, latestRun.id),
              eq(resumeJobMatchCandidate.jobDescriptionId, input.jobDescriptionId),
            ),
          )
          .limit(1)
      : [];
    await tx
      .update(resumePoolItem)
      .set({ jobDescriptionId: input.jobDescriptionId, updatedAt: new Date() })
      .where(eq(resumePoolItem.id, input.poolItemId));
    await writeResumePoolEvent(tx, {
      actorId: input.actorId,
      organizationId: input.organizationId,
      payload: {
        bindingMode: "manual",
        fromJobDescriptionId: current.jobDescriptionId,
        matchRunId: latestRun?.id ?? null,
        selectedCandidateRank: candidate?.aiRank ?? candidate?.recallRank ?? null,
        source: "hr_rebind",
        toJobDescriptionId: input.jobDescriptionId,
      },
      poolItemId: input.poolItemId,
      type: "bound",
    });
    return true;
  });
}

export async function loadResumePoolJobMatchResult(input: {
  organizationId: string;
  poolItemId: string;
}): Promise<ResumePoolJobMatchResult | null> {
  const [run] = await db
    .select({
      createdAt: resumeJobMatchRun.createdAt,
      id: resumeJobMatchRun.id,
      selectedJobDescriptionId: resumeJobMatchRun.selectedJobDescriptionId,
      selectionMethod: resumeJobMatchRun.selectionMethod,
      status: resumeJobMatchRun.status,
    })
    .from(resumeJobMatchRun)
    .where(
      and(
        eq(resumeJobMatchRun.organizationId, input.organizationId),
        eq(resumeJobMatchRun.poolItemId, input.poolItemId),
      ),
    )
    .orderBy(desc(resumeJobMatchRun.createdAt))
    .limit(1);
  if (!run) {
    return null;
  }
  const [poolItem, candidates] = await Promise.all([
    db
      .select({ jobDescriptionId: resumePoolItem.jobDescriptionId })
      .from(resumePoolItem)
      .where(
        and(
          eq(resumePoolItem.id, input.poolItemId),
          eq(resumePoolItem.organizationId, input.organizationId),
        ),
      )
      .limit(1),
    db
      .select({
        aiRank: resumeJobMatchCandidate.aiRank,
        aiReason: resumeJobMatchCandidate.aiReason,
        aiScore: resumeJobMatchCandidate.aiScore,
        currentLifecycleStatus: jobDescription.lifecycleStatus,
        currentOrganizationId: jobDescription.organizationId,
        jobDescriptionId: resumeJobMatchCandidate.jobDescriptionId,
        jobSnapshot: resumeJobMatchCandidate.jobSnapshot,
        recallRank: resumeJobMatchCandidate.recallRank,
        vectorScore: resumeJobMatchCandidate.vectorScore,
      })
      .from(resumeJobMatchCandidate)
      .leftJoin(jobDescription, eq(resumeJobMatchCandidate.jobDescriptionId, jobDescription.id))
      .where(eq(resumeJobMatchCandidate.runId, run.id))
      .orderBy(
        sql`${resumeJobMatchCandidate.aiRank} asc nulls last`,
        sql`${resumeJobMatchCandidate.recallRank} asc nulls last`,
      ),
  ]);
  const currentJobDescriptionId = poolItem[0]?.jobDescriptionId ?? null;
  return {
    candidates: candidates.map((candidate) => ({
      aiRank: candidate.aiRank,
      aiReason: candidate.aiReason,
      aiScore: candidate.aiScore,
      available:
        candidate.currentLifecycleStatus === "published" &&
        candidate.currentOrganizationId === input.organizationId,
      code: candidate.jobSnapshot.code,
      departmentName: candidate.jobSnapshot.departmentName,
      id: candidate.jobDescriptionId ?? candidate.jobSnapshot.id,
      isCurrent:
        currentJobDescriptionId === (candidate.jobDescriptionId ?? candidate.jobSnapshot.id),
      name: candidate.jobSnapshot.name,
      recallRank: candidate.recallRank,
      vectorScore: candidate.vectorScore,
    })),
    createdAt: run.createdAt.toISOString(),
    id: run.id,
    selectedJobDescriptionId: run.selectedJobDescriptionId,
    selectionMethod: run.selectionMethod,
    status: run.status,
  };
}
