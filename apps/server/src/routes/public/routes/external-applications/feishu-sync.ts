import { externalApplicationWorkModeLabels } from "@app/db-schema/external-application-details";
import {
  candidateMaterial,
  externalApplicationLink,
  jobDescription,
  organization,
  resumePoolItem,
} from "@app/db-schema/schema";
import {
  createFeishuBitableRecord,
  feishuBitableAttachmentItemSchema,
  feishuBitableUrlValueSchema,
  getFeishuBitableRecord,
  resolveFeishuBitableTarget,
  updateFeishuBitableRecord,
  uploadFeishuBitableMedia,
} from "@app/feishu/bitable";
import type { FeishuBitableAttachmentValue, FeishuBitableWriteFields } from "@app/feishu/bitable";
import { getFeishuAppCredentials, getPreferredFeishuProviderId } from "@app/feishu/provider";
import { getObjectBytes } from "@app/object-storage";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../../infrastructure/db/index";

const MAX_CACHED_MEDIA_TOKENS = 500;
const syncStates = new Map<string, { pending: boolean; running: boolean }>();
const mediaTokenCache = new Map<string, string>();

const attachmentsListSchema = z.array(feishuBitableAttachmentItemSchema);

interface SyncMaterialRow {
  contentType: string | null;
  fileName: string | null;
  id: string;
  kind: "file" | "link";
  storageKey: string | null;
  title: string;
  url: string | null;
}

interface SyncPoolItemRow {
  applicationDetails: typeof resumePoolItem.$inferSelect.applicationDetails;
  candidateEmail: string | null;
  candidateName: string;
  candidatePhone: string | null;
  createdAt: Date;
  feishuBitableRecordId: string | null;
  id: string;
  jobDescriptionName: string | null;
  linkBitableUrl: string | null;
  organizationSlug: string | null;
  resumeFileName: string | null;
  resumeStorageKey: string | null;
  targetRole: string | null;
}

function rememberMediaToken(cacheKey: string, fileToken: string) {
  if (mediaTokenCache.size >= MAX_CACHED_MEDIA_TOKENS) {
    const oldestKey = mediaTokenCache.keys().next().value;
    if (oldestKey) {
      mediaTokenCache.delete(oldestKey);
    }
  }
  mediaTokenCache.set(cacheKey, fileToken);
}

function resolveTargetBitableUrl(
  organizationSlug: string | null,
  linkBitableUrl: string | null,
): string | null {
  const perWorkspaceUrl = linkBitableUrl?.trim();
  if (perWorkspaceUrl) {
    return perWorkspaceUrl;
  }
  const fallbackUrl = process.env.FEISHU_EXTERNAL_APPLICATION_BITABLE_URL?.trim();
  if (!fallbackUrl) {
    return null;
  }
  const allowedSlug = process.env.FEISHU_EXTERNAL_APPLICATION_BITABLE_ORG_SLUG?.trim();
  if (allowedSlug && allowedSlug !== organizationSlug) {
    return null;
  }
  return fallbackUrl;
}

function hasFeishuCredentials(): boolean {
  try {
    getFeishuAppCredentials(getPreferredFeishuProviderId());
    return true;
  } catch {
    return false;
  }
}

function buildSourceRecordUrl(organizationSlug: string | null, poolItemId: string): string | null {
  const baseUrl = process.env.BETTER_AUTH_URL?.trim();
  if (!baseUrl || !organizationSlug) {
    return null;
  }
  try {
    const { origin } = new URL(baseUrl);
    return `${origin}/w/${encodeURIComponent(organizationSlug)}/studio/resume-pool/${encodeURIComponent(poolItemId)}`;
  } catch {
    return null;
  }
}

async function uploadStorageKeyToFeishu({
  appToken,
  fileName,
  mediaType,
  poolItemId,
  storageKey,
}: {
  appToken: string;
  fileName: string;
  mediaType?: string | null;
  poolItemId: string;
  storageKey: string;
}): Promise<string | null> {
  const cacheKey = `${appToken}:${storageKey}:${fileName}`;
  const cached = mediaTokenCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  try {
    const objectData = await getObjectBytes(storageKey);
    if (!objectData) {
      return null;
    }
    const fileToken = await uploadFeishuBitableMedia({
      appToken,
      bytes: objectData.bytes,
      fileName,
      mediaType: mediaType || objectData.contentType,
    });
    rememberMediaToken(cacheKey, fileToken);
    return fileToken;
  } catch (error) {
    console.error("[external-application-feishu-sync] media upload failed", {
      errorMessage: error instanceof Error ? error.message : "UnknownError",
      fileName,
      poolItemId,
      storageKey,
    });
    return null;
  }
}

function setIfNonEmpty(
  fields: FeishuBitableWriteFields,
  key: string,
  value: string | null | undefined,
) {
  const trimmed = value?.trim();
  if (trimmed) {
    fields[key] = trimmed;
  }
}

function buildCreateFields({
  item,
  materialFileTokens,
  portfolioLink,
  resumeFileToken,
}: {
  item: SyncPoolItemRow;
  materialFileTokens: FeishuBitableAttachmentValue[];
  portfolioLink: { link: string; text: string } | null;
  resumeFileToken: string | null;
}): FeishuBitableWriteFields {
  const details = item.applicationDetails;
  const fields: FeishuBitableWriteFields = {
    候选人姓名: item.candidateName,
    当前阶段: "已收件",
    投递时间: item.createdAt.getTime(),
    材料状态: "待核对",
  };
  setIfNonEmpty(fields, "首选岗位", item.jobDescriptionName || item.targetRole);
  if (resumeFileToken) {
    fields["简历 PDF"] = [{ file_token: resumeFileToken }];
  }
  if (details) {
    fields["办公形式"] = externalApplicationWorkModeLabels[details.workMode];
    setIfNonEmpty(fields, "培训机构/校区", details.trainingInstitution);
    setIfNonEmpty(fields, "班级", details.className);
    setIfNonEmpty(fields, "批次", details.batch);
    setIfNonEmpty(fields, "备选岗位", details.alternateJobName);
    setIfNonEmpty(fields, "作品个人分工", details.portfolioContribution);
  }
  setIfNonEmpty(
    fields,
    "联系方式",
    details?.contactRaw || item.candidatePhone || item.candidateEmail,
  );
  const sourceRecordUrl = buildSourceRecordUrl(item.organizationSlug, item.id);
  if (sourceRecordUrl) {
    fields["原投递记录"] = { link: sourceRecordUrl, text: "查看人才库记录" };
  }
  if (portfolioLink) {
    fields["作品集链接"] = portfolioLink;
  }
  if (materialFileTokens.length > 0) {
    fields["作品附件"] = materialFileTokens;
  }
  return fields;
}

function findFirstLinkMaterial(
  materials: SyncMaterialRow[],
): { link: string; text: string } | null {
  const firstLink = materials.find((material) => material.kind === "link" && material.url);
  if (!firstLink?.url) {
    return null;
  }
  return {
    link: firstLink.url,
    text: firstLink.title.trim() || "作品集链接",
  };
}

async function uploadPendingFileMaterials({
  appToken,
  existingAttachments,
  materials,
  poolItemId,
}: {
  appToken: string;
  existingAttachments: FeishuBitableAttachmentValue[];
  materials: SyncMaterialRow[];
  poolItemId: string;
}): Promise<FeishuBitableAttachmentValue[]> {
  const existingNames = new Set(
    existingAttachments
      .map((entry) => entry.name?.trim())
      .filter((name): name is string => Boolean(name)),
  );
  const existingTokenSet = new Set(existingAttachments.map((entry) => entry.file_token));
  const appended: FeishuBitableAttachmentValue[] = [];

  for (const material of materials) {
    if (material.kind !== "file" || !material.storageKey) {
      continue;
    }
    const fileName = material.fileName?.trim() || material.title;
    if (existingNames.has(fileName)) {
      continue;
    }
    const fileToken = await uploadStorageKeyToFeishu({
      appToken,
      fileName,
      mediaType: material.contentType,
      poolItemId,
      storageKey: material.storageKey,
    });
    if (fileToken && !existingTokenSet.has(fileToken)) {
      existingTokenSet.add(fileToken);
      existingNames.add(fileName);
      appended.push({ file_token: fileToken });
    }
  }
  return appended;
}

async function loadSyncInput(poolItemId: string): Promise<{
  item: SyncPoolItemRow;
  materials: SyncMaterialRow[];
} | null> {
  const [item] = await db
    .select({
      applicationDetails: resumePoolItem.applicationDetails,
      candidateEmail: resumePoolItem.candidateEmail,
      candidateName: resumePoolItem.candidateName,
      candidatePhone: resumePoolItem.candidatePhone,
      createdAt: resumePoolItem.createdAt,
      feishuBitableRecordId: resumePoolItem.feishuBitableRecordId,
      id: resumePoolItem.id,
      jobDescriptionName: jobDescription.name,
      linkBitableUrl: externalApplicationLink.feishuBitableUrl,
      organizationSlug: organization.slug,
      resumeFileName: resumePoolItem.resumeFileName,
      resumeStorageKey: resumePoolItem.resumeStorageKey,
      targetRole: resumePoolItem.targetRole,
    })
    .from(resumePoolItem)
    .leftJoin(organization, eq(resumePoolItem.organizationId, organization.id))
    .leftJoin(
      externalApplicationLink,
      eq(resumePoolItem.organizationId, externalApplicationLink.organizationId),
    )
    .leftJoin(jobDescription, eq(resumePoolItem.jobDescriptionId, jobDescription.id))
    .where(
      and(
        eq(resumePoolItem.id, poolItemId),
        eq(resumePoolItem.sourceChannel, "external_application"),
      ),
    )
    .limit(1);

  if (!item) {
    return null;
  }

  const materials = await db
    .select({
      contentType: candidateMaterial.contentType,
      fileName: candidateMaterial.fileName,
      id: candidateMaterial.id,
      kind: candidateMaterial.kind,
      storageKey: candidateMaterial.storageKey,
      title: candidateMaterial.title,
      url: candidateMaterial.url,
    })
    .from(candidateMaterial)
    .where(
      and(
        eq(candidateMaterial.resumePoolItemId, item.id),
        eq(candidateMaterial.ownerType, "resume_pool_item"),
      ),
    )
    .orderBy(asc(candidateMaterial.createdAt), asc(candidateMaterial.id));

  return { item, materials };
}

async function createBitableRowForItem({
  appToken,
  item,
  materials,
  tableId,
}: {
  appToken: string;
  item: SyncPoolItemRow;
  materials: SyncMaterialRow[];
  tableId: string;
}) {
  const resumeFileToken = item.resumeStorageKey
    ? await uploadStorageKeyToFeishu({
        appToken,
        fileName: item.resumeFileName?.trim() || "resume.pdf",
        poolItemId: item.id,
        storageKey: item.resumeStorageKey,
      })
    : null;
  const materialFileTokens = await uploadPendingFileMaterials({
    appToken,
    existingAttachments: [],
    materials,
    poolItemId: item.id,
  });
  const fields = buildCreateFields({
    item,
    materialFileTokens,
    portfolioLink: findFirstLinkMaterial(materials),
    resumeFileToken,
  });
  const created = await createFeishuBitableRecord({ appToken, fields, tableId });
  await db
    .update(resumePoolItem)
    .set({ feishuBitableRecordId: created.recordId })
    .where(and(eq(resumePoolItem.id, item.id), isNull(resumePoolItem.feishuBitableRecordId)));
}

async function syncIncrementalAttachments({
  appToken,
  item,
  materials,
  recordId,
  tableId,
}: {
  appToken: string;
  item: SyncPoolItemRow;
  materials: SyncMaterialRow[];
  recordId: string;
  tableId: string;
}) {
  const existing = await getFeishuBitableRecord({ appToken, recordId, tableId });
  const parsedAttachments = attachmentsListSchema.safeParse(existing.fields["作品附件"]);
  const existingAttachments = parsedAttachments.success ? parsedAttachments.data : [];
  const appendedTokens = await uploadPendingFileMaterials({
    appToken,
    existingAttachments,
    materials,
    poolItemId: item.id,
  });

  const patchFields: FeishuBitableWriteFields = {};
  if (appendedTokens.length > 0) {
    patchFields["作品附件"] = [
      ...existingAttachments.map((entry) => ({ file_token: entry.file_token })),
      ...appendedTokens,
    ];
  }

  const parsedExistingLink = feishuBitableUrlValueSchema.safeParse(existing.fields["作品集链接"]);
  const firstLink = findFirstLinkMaterial(materials);
  if (!parsedExistingLink.success && firstLink) {
    patchFields["作品集链接"] = firstLink;
  }

  if (Object.keys(patchFields).length > 0) {
    await updateFeishuBitableRecord({ appToken, fields: patchFields, recordId, tableId });
  }
}

export async function syncExternalApplicationToFeishu(poolItemId: string): Promise<void> {
  if (!hasFeishuCredentials()) {
    return;
  }
  const loaded = await loadSyncInput(poolItemId);
  if (!loaded) {
    return;
  }
  const { item, materials } = loaded;
  const targetUrl = resolveTargetBitableUrl(item.organizationSlug, item.linkBitableUrl);
  if (!targetUrl) {
    return;
  }
  const { appToken, tableId } = await resolveFeishuBitableTarget(targetUrl);
  if (!item.feishuBitableRecordId) {
    await createBitableRowForItem({ appToken, item, materials, tableId });
    return;
  }
  await syncIncrementalAttachments({
    appToken,
    item,
    materials,
    recordId: item.feishuBitableRecordId,
    tableId,
  });
}

async function runSyncLoop(poolItemId: string): Promise<void> {
  const state = syncStates.get(poolItemId);
  if (!state || state.running) {
    return;
  }
  state.running = true;
  try {
    while (state.pending) {
      state.pending = false;
      try {
        await syncExternalApplicationToFeishu(poolItemId);
      } catch (error) {
        console.error("[external-application-feishu-sync] sync failed", {
          errorMessage: error instanceof Error ? error.message : "UnknownError",
          poolItemId,
        });
      }
    }
  } finally {
    state.running = false;
    if (!state.pending) {
      syncStates.delete(poolItemId);
    }
  }
}

export function scheduleExternalApplicationFeishuSync(poolItemId: string): void {
  const existing = syncStates.get(poolItemId);
  if (existing) {
    existing.pending = true;
    return;
  }
  syncStates.set(poolItemId, { pending: true, running: false });
  queueMicrotask(() => runSyncLoop(poolItemId));
}
