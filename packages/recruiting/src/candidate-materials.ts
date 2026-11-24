import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@app/database/context";
import type { Database } from "@app/database";
import { candidateMaterial } from "@app/db-schema/schema";
import {
  CANDIDATE_MATERIAL_MAX_COUNT,
  deriveCandidateMaterialLinkTitle,
  inferCandidateMaterialCategory,
} from "@app/shared/candidate-materials";
import type {
  CandidateMaterialCategory,
  CandidateMaterialItem,
  CreateCandidateMaterialLinkInput,
  UpdateCandidateMaterialInput,
} from "@app/shared/candidate-materials";

export type CandidateMaterialTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type CandidateMaterialExecutor = Database | CandidateMaterialTransaction;

export type CandidateMaterialOwnerScope =
  | {
      organizationId: string;
      ownerId: string;
      ownerType: "resume_pool_item";
    }
  | {
      organizationId: string;
      ownerId: string;
      ownerType: "recruiting_record";
    };

export class CandidateMaterialError extends Error {
  readonly status: 400 | 404 | 409;

  constructor(message: string, status: 400 | 404 | 409 = 400) {
    super(message);
    this.name = "CandidateMaterialError";
    this.status = status;
  }
}

function ownerWhere(scope: CandidateMaterialOwnerScope) {
  if (scope.ownerType === "resume_pool_item") {
    return and(
      eq(candidateMaterial.organizationId, scope.organizationId),
      eq(candidateMaterial.ownerType, "resume_pool_item"),
      eq(candidateMaterial.resumePoolItemId, scope.ownerId),
    );
  }
  return and(
    eq(candidateMaterial.organizationId, scope.organizationId),
    eq(candidateMaterial.ownerType, "recruiting_record"),
    eq(candidateMaterial.recruitingRecordId, scope.ownerId),
  );
}

function ownerColumns(scope: CandidateMaterialOwnerScope) {
  if (scope.ownerType === "resume_pool_item") {
    return {
      organizationId: scope.organizationId,
      ownerType: "resume_pool_item" as const,
      recruitingRecordId: null,
      resumePoolItemId: scope.ownerId,
    };
  }
  return {
    organizationId: scope.organizationId,
    ownerType: "recruiting_record" as const,
    recruitingRecordId: scope.ownerId,
    resumePoolItemId: null,
  };
}

async function lockCandidateMaterialStorageKeyTx(
  tx: CandidateMaterialTransaction,
  storageKey: string,
) {
  const lockKey = `candidate-material-storage:${storageKey}`;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
}

export function serializeCandidateMaterial(
  row: typeof candidateMaterial.$inferSelect,
): CandidateMaterialItem {
  return {
    category: row.category,
    contentType: row.contentType,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    fileName: row.fileName,
    id: row.id,
    kind: row.kind,
    notes: row.notes,
    ownerType: row.ownerType,
    sizeBytes: row.sizeBytes,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
    url: row.url,
  };
}

export async function listCandidateMaterials(
  scope: CandidateMaterialOwnerScope,
  database: CandidateMaterialExecutor = db,
): Promise<CandidateMaterialItem[]> {
  const rows = await database
    .select()
    .from(candidateMaterial)
    .where(ownerWhere(scope))
    .orderBy(asc(candidateMaterial.createdAt), asc(candidateMaterial.id));
  return rows.map(serializeCandidateMaterial);
}

export async function findCandidateMaterial(
  scope: CandidateMaterialOwnerScope,
  materialId: string,
  database: CandidateMaterialExecutor = db,
): Promise<typeof candidateMaterial.$inferSelect | null> {
  const [row] = await database
    .select()
    .from(candidateMaterial)
    .where(and(ownerWhere(scope), eq(candidateMaterial.id, materialId)));
  return row ?? null;
}

export async function countCandidateMaterialsTx(
  tx: CandidateMaterialTransaction,
  scope: CandidateMaterialOwnerScope,
): Promise<number> {
  const rows = await tx
    .select({ id: candidateMaterial.id })
    .from(candidateMaterial)
    .where(ownerWhere(scope));
  return rows.length;
}

export async function hasAnyCandidateMaterialStorageKey(
  storageKey: string,
  database: CandidateMaterialExecutor = db,
): Promise<boolean> {
  const [row] = await database
    .select({ id: candidateMaterial.id })
    .from(candidateMaterial)
    .where(eq(candidateMaterial.storageKey, storageKey))
    .limit(1);
  return Boolean(row);
}

export async function createCandidateMaterialLink(
  scope: CandidateMaterialOwnerScope,
  input: CreateCandidateMaterialLinkInput,
  actorId: string,
  database: Database = db,
): Promise<CandidateMaterialItem> {
  const row = await database.transaction(async (tx) => {
    const existingCount = await countCandidateMaterialsTx(tx, scope);
    if (existingCount >= CANDIDATE_MATERIAL_MAX_COUNT) {
      throw new CandidateMaterialError(
        `每条记录最多保存 ${CANDIDATE_MATERIAL_MAX_COUNT} 份补充资料，请删除后再添加`,
        409,
      );
    }
    const now = new Date();
    const title = input.title?.trim() || deriveCandidateMaterialLinkTitle(input.url);
    const [inserted] = await tx
      .insert(candidateMaterial)
      .values({
        ...ownerColumns(scope),
        category: input.category,
        contentHash: null,
        contentType: null,
        createdAt: now,
        createdBy: actorId,
        fileName: null,
        id: crypto.randomUUID(),
        kind: "link",
        notes: input.notes,
        sizeBytes: null,
        storageKey: null,
        title,
        updatedAt: now,
        url: input.url,
      })
      .returning();
    return inserted;
  });
  return serializeCandidateMaterial(row);
}

export interface InsertCandidateMaterialFileInput {
  category?: CandidateMaterialCategory;
  contentHash: string;
  contentType: string;
  fileName: string;
  notes?: string;
  sizeBytes: number;
  storageKey: string;
  title?: string;
}

export async function insertCandidateMaterialFileTx(
  tx: CandidateMaterialTransaction,
  scope: CandidateMaterialOwnerScope,
  input: InsertCandidateMaterialFileInput,
  actorId: string,
): Promise<CandidateMaterialItem> {
  await lockCandidateMaterialStorageKeyTx(tx, input.storageKey);
  const existingCount = await countCandidateMaterialsTx(tx, scope);
  if (existingCount >= CANDIDATE_MATERIAL_MAX_COUNT) {
    throw new CandidateMaterialError(
      `每条记录最多保存 ${CANDIDATE_MATERIAL_MAX_COUNT} 份补充资料，请删除后再添加`,
      409,
    );
  }
  const now = new Date();
  const title = input.title?.trim() || input.fileName;
  const category =
    input.category ?? inferCandidateMaterialCategory(input.fileName, input.contentType);
  const [inserted] = await tx
    .insert(candidateMaterial)
    .values({
      ...ownerColumns(scope),
      category,
      contentHash: input.contentHash,
      contentType: input.contentType,
      createdAt: now,
      createdBy: actorId,
      fileName: input.fileName,
      id: crypto.randomUUID(),
      kind: "file",
      notes: input.notes ?? "",
      sizeBytes: input.sizeBytes,
      storageKey: input.storageKey,
      title,
      updatedAt: now,
      url: null,
    })
    .returning();
  return serializeCandidateMaterial(inserted);
}

export async function updateCandidateMaterial(
  scope: CandidateMaterialOwnerScope,
  materialId: string,
  patch: UpdateCandidateMaterialInput,
  database: Database = db,
): Promise<CandidateMaterialItem | null> {
  const existing = await findCandidateMaterial(scope, materialId, database);
  if (!existing) {
    return null;
  }
  if (patch.url !== undefined && existing.kind !== "link") {
    throw new CandidateMaterialError("文件类型资料不支持修改链接地址", 400);
  }
  const updates: Partial<typeof candidateMaterial.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (patch.category !== undefined) {
    updates.category = patch.category;
  }
  if (patch.notes !== undefined) {
    updates.notes = patch.notes;
  }
  if (patch.title !== undefined) {
    updates.title = patch.title;
  }
  if (patch.url !== undefined) {
    updates.url = patch.url;
  }
  const [updated] = await database
    .update(candidateMaterial)
    .set(updates)
    .where(and(ownerWhere(scope), eq(candidateMaterial.id, materialId)))
    .returning();
  return updated ? serializeCandidateMaterial(updated) : null;
}

export function deleteCandidateMaterial(
  scope: CandidateMaterialOwnerScope,
  materialId: string,
  database: Database = db,
): Promise<{
  removed: typeof candidateMaterial.$inferSelect;
  shouldDeleteObject: boolean;
} | null> {
  return database.transaction(async (tx) => {
    const existing = await findCandidateMaterial(scope, materialId, tx);
    if (!existing) {
      return null;
    }
    if (existing.kind === "file" && existing.storageKey) {
      await lockCandidateMaterialStorageKeyTx(tx, existing.storageKey);
    }
    const [removed] = await tx
      .delete(candidateMaterial)
      .where(and(ownerWhere(scope), eq(candidateMaterial.id, materialId)))
      .returning();
    if (!removed) {
      return null;
    }
    if (removed.kind !== "file" || !removed.storageKey) {
      return { removed, shouldDeleteObject: false };
    }
    const remaining = await tx
      .select({ id: candidateMaterial.id })
      .from(candidateMaterial)
      .where(eq(candidateMaterial.storageKey, removed.storageKey))
      .limit(1);
    return {
      removed,
      shouldDeleteObject: remaining.length === 0,
    };
  });
}

async function copyCandidateMaterialsTx(
  tx: CandidateMaterialTransaction,
  sourceScope: CandidateMaterialOwnerScope,
  targetScope: CandidateMaterialOwnerScope,
): Promise<number> {
  const sourceRows = await tx
    .select()
    .from(candidateMaterial)
    .where(ownerWhere(sourceScope))
    .orderBy(asc(candidateMaterial.createdAt), asc(candidateMaterial.id));
  if (sourceRows.length === 0) {
    return 0;
  }

  const storageKeys = [
    ...new Set(
      sourceRows
        .map((row) => (row.kind === "file" ? row.storageKey : null))
        .filter((key): key is string => Boolean(key)),
    ),
  ].toSorted();
  for (const storageKey of storageKeys) {
    await lockCandidateMaterialStorageKeyTx(tx, storageKey);
  }

  const targetColumns = ownerColumns(targetScope);
  await tx.insert(candidateMaterial).values(
    sourceRows.map((row) => ({
      ...targetColumns,
      category: row.category,
      contentHash: row.contentHash,
      contentType: row.contentType,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
      fileName: row.fileName,
      id: crypto.randomUUID(),
      kind: row.kind,
      notes: row.notes,
      sizeBytes: row.sizeBytes,
      storageKey: row.storageKey,
      title: row.title,
      updatedAt: row.updatedAt,
      url: row.url,
    })),
  );
  return sourceRows.length;
}

export function copyCandidateMaterialsToRecruitingRecordTx(
  tx: CandidateMaterialTransaction,
  input: {
    organizationId: string;
    poolItemId: string;
    recruitingRecordId: string;
  },
): Promise<number> {
  return copyCandidateMaterialsTx(
    tx,
    {
      organizationId: input.organizationId,
      ownerId: input.poolItemId,
      ownerType: "resume_pool_item",
    },
    {
      organizationId: input.organizationId,
      ownerId: input.recruitingRecordId,
      ownerType: "recruiting_record",
    },
  );
}

export function copyCandidateMaterialsToPoolItemTx(
  tx: CandidateMaterialTransaction,
  input: {
    organizationId: string;
    sourcePoolItemId: string;
    targetPoolItemId: string;
  },
): Promise<number> {
  return copyCandidateMaterialsTx(
    tx,
    {
      organizationId: input.organizationId,
      ownerId: input.sourcePoolItemId,
      ownerType: "resume_pool_item",
    },
    {
      organizationId: input.organizationId,
      ownerId: input.targetPoolItemId,
      ownerType: "resume_pool_item",
    },
  );
}
