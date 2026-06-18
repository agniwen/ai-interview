import { and, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  mailIngestMessage,
  organization,
  resumePoolEvent,
  resumePoolImport,
  resumePoolItem,
  resumeUploadBatchItem,
  user,
} from "@arc/db-schema/schema";
import type { ResumePoolEventType, ResumePoolScope, ResumePoolStatus } from "@arc/db-schema/schema";
import type { ResumeParseStatus } from "@arc/db-schema/studio-interviews";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type {
  PaginatedResumePoolResult,
  ResumePoolDetail,
  ResumePoolImportResult,
  ResumePoolListRecord,
  ResumePoolProfileHighlights,
  ResumePoolSourceChannel,
} from "@arc/shared/resume-pool";
import {
  formatResumeEducationItems,
  formatResumeEducationLines,
} from "@arc/shared/resume-education";
import { queryInterviewDedup } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/studio-interviews";
import { createResumeRecordFromStorage } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/create-from-storage";
import { normalizeSkill } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/skills";

type PoolRow = typeof resumePoolItem.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
interface PoolUploaderMeta {
  uploaderEmail: string | null;
  uploaderImage: string | null;
  uploaderName: string | null;
  uploaderOrganizationName: string | null;
}

const EMPTY_UPLOADER_META: PoolUploaderMeta = {
  uploaderEmail: null,
  uploaderImage: null,
  uploaderName: null,
  uploaderOrganizationName: null,
};

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
  resumeProfile: ResumeProfile | null;
  scope: ResumePoolScope;
  storageKey: string | null;
  targetRole: string | null;
}

export interface MarkResumePoolItemParsedInput {
  actorId: string | null;
  organizationId: string | null;
  poolItemId: string;
  resumeProfile: ResumeProfile | null;
}

export interface QueryResumePoolItemsInput {
  organizationId: string;
  scope: ResumePoolScope;
  userId: string;
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
}

export interface DeleteOwnPoolItemInput {
  organizationId: string;
  poolItemId: string;
  userId: string;
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

function serializeDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function cleanHighlightText(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text || text === "未发现信息") {
    return null;
  }
  return text;
}

function firstPresentValue(values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    const text = cleanHighlightText(value);
    if (text) {
      return text;
    }
  }
  return null;
}

function buildProfileHighlights(profile: ResumeProfile | null): ResumePoolProfileHighlights {
  if (!profile) {
    return {
      educationItems: [],
      educationLines: [],
      latestCompany: null,
      latestProject: null,
      schools: [],
    };
  }
  const schools = profile.schools
    .map(cleanHighlightText)
    .filter((item): item is string => item !== null);
  return {
    educationItems: formatResumeEducationItems(profile.educationExperiences),
    educationLines: formatResumeEducationLines(profile.educationExperiences),
    latestCompany: firstPresentValue(profile.workExperiences.map((item) => item.company)),
    latestProject: firstPresentValue(profile.projectExperiences.map((item) => item.name)),
    schools,
  };
}

function buildMasteredSkills(profile: ResumeProfile | null): string[] {
  return [
    ...new Set(
      (profile?.skills ?? [])
        .map(cleanHighlightText)
        .filter((skill): skill is string => skill !== null),
    ),
  ];
}

function toListRecord(
  row: PoolRow,
  importRow?: { importedAt: Date; resumeRecordId: string } | null,
  uploaderMeta: PoolUploaderMeta = EMPTY_UPLOADER_META,
  sourceChannel: ResumePoolSourceChannel | null = null,
): ResumePoolListRecord {
  return {
    candidateEmail: row.candidateEmail,
    candidateName: row.candidateName,
    candidatePhone: row.candidatePhone,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    id: row.id,
    importedAt: importRow ? importRow.importedAt.toISOString() : null,
    importedResumeRecordId: importRow?.resumeRecordId ?? null,
    jobDescriptionId: row.jobDescriptionId,
    masteredSkills: buildMasteredSkills(row.resumeProfile),
    notes: row.notes,
    organizationId: row.organizationId,
    profileHighlights: buildProfileHighlights(row.resumeProfile),
    publishedAt: serializeDate(row.publishedAt),
    publishedBy: row.publishedBy,
    resumeContentHash: row.resumeContentHash,
    resumeFileName: row.resumeFileName,
    resumeParseError: row.resumeParseError,
    resumeParseStatus: row.resumeParseStatus,
    resumeParsedAt: serializeDate(row.resumeParsedAt),
    resumeStorageKey: row.resumeStorageKey,
    scope: row.scope,
    skillsNormalized: row.skillsNormalized,
    sourceChannel,
    sourceOrganizationId: row.sourceOrganizationId,
    sourcePoolItemId: row.sourcePoolItemId,
    sourceUserId: row.sourceUserId,
    status: row.status,
    targetRole: row.targetRole,
    updatedAt: row.updatedAt.toISOString(),
    uploaderEmail: uploaderMeta.uploaderEmail,
    uploaderImage: uploaderMeta.uploaderImage,
    uploaderName: uploaderMeta.uploaderName,
    uploaderOrganizationName: uploaderMeta.uploaderOrganizationName,
    workYears: row.resumeProfile?.workYears ?? null,
  };
}

function toDetail(
  row: PoolRow,
  importRow?: { importedAt: Date; resumeRecordId: string } | null,
  uploaderMeta: PoolUploaderMeta = EMPTY_UPLOADER_META,
  sourceChannel: ResumePoolSourceChannel | null = null,
): ResumePoolDetail {
  return {
    ...toListRecord(row, importRow, uploaderMeta, sourceChannel),
    resumeProfile: row.resumeProfile,
  };
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

async function writeResumePoolEvent(
  tx: Tx,
  input: {
    actorId: string | null;
    organizationId: string | null;
    payload?: unknown;
    poolItemId: string;
    type: ResumePoolEventType;
  },
) {
  await tx.insert(resumePoolEvent).values({
    actorId: input.actorId,
    id: crypto.randomUUID(),
    organizationId: input.organizationId,
    payload: input.payload as never,
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
      resumeParseStatus: (input.resumeProfile ? "ready" : "unparsed") as ResumeParseStatus,
      resumeParsedAt: input.resumeProfile ? now : null,
      resumeProfile: input.resumeProfile,
      resumeStorageKey: input.storageKey,
      scope: input.scope,
      skillsNormalized: normalizeSkills(input.resumeProfile?.skills),
      sourceOrganizationId: input.scope === "public" ? input.organizationId : null,
      sourcePoolItemId: null,
      sourceUserId: input.scope === "public" ? input.createdBy : null,
      status: "active" as ResumePoolStatus,
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
  await db.transaction(async (tx) => {
    await tx
      .update(resumePoolItem)
      .set({
        candidateEmail: input.resumeProfile?.email ?? row.candidateEmail,
        candidateName: input.resumeProfile?.name || row.candidateName,
        candidatePhone: input.resumeProfile?.phone ?? row.candidatePhone,
        resumeParseError: null,
        resumeParseStatus: "ready",
        resumeParsedAt: now,
        resumeProfile: input.resumeProfile,
        skillsNormalized: normalizeSkills(input.resumeProfile?.skills),
        targetRole: input.resumeProfile?.targetRoles?.[0] || row.targetRole,
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

function accessibleWhere(input: { organizationId: string; poolItemId: string; userId: string }) {
  return and(eq(resumePoolItem.id, input.poolItemId), eq(resumePoolItem.status, "active"));
}

async function loadAccessiblePoolItem(input: {
  organizationId: string;
  poolItemId: string;
  userId: string;
}): Promise<PoolRow | null> {
  const [row] = await db.select().from(resumePoolItem).where(accessibleWhere(input)).limit(1);
  if (!row) {
    return null;
  }
  if (row.scope === "public") {
    return row;
  }
  if (row.organizationId === input.organizationId && row.createdBy === input.userId) {
    return row;
  }
  return null;
}

async function loadImportForOrg(
  poolItemId: string,
  organizationId: string,
): Promise<{ importedAt: Date; resumeRecordId: string } | null> {
  const [row] = await db
    .select({
      importedAt: resumePoolImport.importedAt,
      resumeRecordId: resumePoolImport.importedResumeRecordId,
    })
    .from(resumePoolImport)
    .where(
      and(
        eq(resumePoolImport.poolItemId, poolItemId),
        eq(resumePoolImport.organizationId, organizationId),
      ),
    )
    .orderBy(desc(resumePoolImport.importedAt))
    .limit(1);
  return row ?? null;
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

export async function queryResumePoolItems(
  input: QueryResumePoolItemsInput,
): Promise<PaginatedResumePoolResult> {
  const where =
    input.scope === "private"
      ? and(
          eq(resumePoolItem.scope, "private"),
          eq(resumePoolItem.status, "active"),
          eq(resumePoolItem.organizationId, input.organizationId),
          eq(resumePoolItem.createdBy, input.userId),
        )
      : and(eq(resumePoolItem.scope, "public"), eq(resumePoolItem.status, "active"));

  const [totalRow] = await db.select({ total: count() }).from(resumePoolItem).where(where);
  const rows = await db
    .select({
      item: resumePoolItem,
      uploaderEmail: user.email,
      uploaderImage: user.image,
      uploaderName: user.name,
      uploaderOrganizationName: organization.name,
    })
    .from(resumePoolItem)
    .leftJoin(organization, eq(resumePoolItem.organizationId, organization.id))
    .leftJoin(user, eq(resumePoolItem.createdBy, user.id))
    .where(where)
    .orderBy(desc(resumePoolItem.createdAt))
    .limit(100);
  const imports = await Promise.all(
    rows.map((row) => loadImportForOrg(row.item.id, input.organizationId)),
  );
  const sourceChannels = await loadSourceChannels(rows.map((row) => row.item.id));
  return {
    records: rows.map((row, index) =>
      toListRecord(
        row.item,
        imports[index] ?? null,
        uploaderMetaFromRow(row),
        sourceChannels.get(row.item.id) ?? null,
      ),
    ),
    total: totalRow?.total ?? 0,
  };
}

export async function loadResumePoolItem(input: {
  organizationId: string;
  poolItemId: string;
  userId: string;
}): Promise<ResumePoolDetail | null> {
  const row = await loadAccessiblePoolItem(input);
  if (!row) {
    return null;
  }
  const [importRow, uploaderMeta] = await Promise.all([
    loadImportForOrg(row.id, input.organizationId),
    loadUploaderMeta(row.id),
  ]);
  const sourceChannels = await loadSourceChannels([row.id]);
  return toDetail(row, importRow, uploaderMeta, sourceChannels.get(row.id) ?? null);
}

export async function publishPrivatePoolItem(
  input: PublishPrivatePoolItemInput,
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
      scope: "public",
      skillsNormalized: privateItem.skillsNormalized,
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
  return publicItem;
}

export async function importPoolItemToResumeLibrary(
  input: ImportPoolItemInput,
): Promise<ResumePoolImportResult> {
  const poolItem = await loadAccessiblePoolItem({
    organizationId: input.organizationId,
    poolItemId: input.poolItemId,
    userId: input.importedBy,
  });
  if (!poolItem) {
    throw new Error("简历池记录不存在或无权访问");
  }
  if (poolItem.resumeParseStatus !== "ready") {
    throw new Error("简历解析完成后才能入库");
  }

  const matches = await queryInterviewDedup(input.organizationId, {
    email: poolItem.candidateEmail ?? poolItem.resumeProfile?.email ?? null,
    name: poolItem.candidateName ?? poolItem.resumeProfile?.name ?? null,
    phone: poolItem.candidatePhone ?? poolItem.resumeProfile?.phone ?? null,
  });
  if (input.dedupPolicy === "check" && matches.length > 0) {
    return {
      matches: matches.map((match) => ({
        candidateEmail: match.candidateEmail,
        candidateName: match.candidateName,
        candidatePhone: match.candidatePhone,
        id: match.id,
        resumeFileName: null,
      })),
      status: "duplicate_found",
    };
  }

  const importedAt = new Date();
  let resumeRecordId = "";
  await db.transaction(async (tx) => {
    resumeRecordId = await createResumeRecordFromStorage(
      {
        candidateEmail: poolItem.candidateEmail,
        candidateName: poolItem.candidateName,
        candidatePhone: poolItem.candidatePhone,
        contentHash: poolItem.resumeContentHash,
        jobDescriptionId: input.jobDescriptionId,
        notes: poolItem.notes,
        organizationId: input.organizationId,
        resumeFileName: poolItem.resumeFileName,
        resumeProfile: poolItem.resumeProfile,
        source: {
          importedAt,
          importedBy: input.importedBy,
          poolItemId: poolItem.id,
          type: poolItem.scope === "public" ? "public_pool" : "private_pool",
        },
        storageKey: poolItem.resumeStorageKey,
        targetRole: poolItem.targetRole,
        userId: input.importedBy,
      },
      tx,
    );
    await tx.insert(resumePoolImport).values({
      id: crypto.randomUUID(),
      importedAt,
      importedBy: input.importedBy,
      importedResumeRecordId: resumeRecordId,
      organizationId: input.organizationId,
      poolItemId: poolItem.id,
    });
    await writeResumePoolEvent(tx, {
      actorId: input.importedBy,
      organizationId: input.organizationId,
      payload: { resumeRecordId },
      poolItemId: poolItem.id,
      type: "imported",
    });
  });

  return { resumeRecordId, status: "imported" };
}

export async function deleteOwnPoolItem(input: DeleteOwnPoolItemInput): Promise<void> {
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
}
