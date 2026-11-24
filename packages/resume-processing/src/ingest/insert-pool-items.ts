import type { Database } from "@app/database";
import { resumePoolEvent, resumePoolItem } from "@app/db-schema/schema";
import type { ResumePoolScope, ResumePoolSourceChannel } from "@app/db-schema/schema";
import type { ExternalApplicationDetails } from "@app/db-schema/external-application-details";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface ExternalApplicationBatchPayload {
  applicationDetails: ExternalApplicationDetails;
  candidateEmail: string | null;
  candidateName: string;
  candidatePhone: string | null;
  targetRole: string | null;
}

export interface BatchPoolRowInput {
  file: {
    contentHash: string;
    fileSize: number;
    originalFileName: string;
    storageKey: string;
  };
  poolItemId: string;
}

export function candidateNameFromFileName(fileName: string): string {
  const trimmed = fileName.trim();
  const withoutExt = trimmed.replace(/\.pdf$/i, "").trim();
  return withoutExt || "未解析简历";
}

export async function insertPoolItemsForBatch(
  tx: Transaction,
  input: {
    externalApplication?: ExternalApplicationBatchPayload;
    jdMode: "bind" | "auto" | "none";
    jobDescriptionId: string | null;
    now: Date;
    organizationId: string;
    poolRows: BatchPoolRowInput[];
    referralTargetRole?: string | null;
    scope: ResumePoolScope;
    sourceChannel?: ResumePoolSourceChannel | null;
    userId: string;
  },
) {
  const { externalApplication, now, poolRows, scope } = input;
  if (poolRows.length === 0) {
    return;
  }
  await tx.insert(resumePoolItem).values(
    poolRows.map(({ file, poolItemId }) => ({
      applicationDetails: externalApplication?.applicationDetails ?? null,
      candidateEmail: externalApplication?.candidateEmail ?? null,
      candidateName:
        externalApplication?.candidateName || candidateNameFromFileName(file.originalFileName),
      candidatePhone: externalApplication?.candidatePhone ?? null,
      createdAt: now,
      createdBy: input.userId,
      id: poolItemId,
      jobDescriptionId: input.jdMode === "bind" ? input.jobDescriptionId : null,
      notes: null,
      organizationId: input.organizationId,
      publishedAt: scope === "public" ? now : null,
      publishedBy: scope === "public" ? input.userId : null,
      resumeContentHash: file.contentHash,
      resumeFileName: file.originalFileName,
      resumeParseError: null,
      resumeParseStatus: "queued" as const,
      resumeParsedAt: null,
      resumeProfile: null,
      resumeStorageKey: file.storageKey,
      scope,
      skillsNormalized: [],
      sourceChannel: input.sourceChannel ?? null,
      sourceOrganizationId: scope === "public" ? input.organizationId : null,
      sourcePoolItemId: null,
      sourceUserId: scope === "public" ? input.userId : null,
      status: "active" as const,
      targetRole: externalApplication?.targetRole ?? (input.referralTargetRole?.trim() || null),
      updatedAt: now,
    })),
  );
  await tx.insert(resumePoolEvent).values(
    poolRows.map(({ poolItemId }) => ({
      actorId: input.userId,
      createdAt: now,
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      poolItemId,
      type: "created" as const,
    })),
  );
  if (input.jdMode === "bind" && input.jobDescriptionId) {
    const bindingMode =
      input.sourceChannel === "referral" || input.sourceChannel === "mail_ingest"
        ? "automatic"
        : "manual";
    await tx.insert(resumePoolEvent).values(
      poolRows.map(({ poolItemId }) => ({
        actorId: input.userId,
        createdAt: now,
        id: crypto.randomUUID(),
        organizationId: input.organizationId,
        payload: {
          bindingMode,
          fromJobDescriptionId: null,
          source: input.sourceChannel === "referral" ? "referral" : "batch_fixed_job",
          toJobDescriptionId: input.jobDescriptionId,
        },
        poolItemId,
        type: "bound" as const,
      })),
    );
  }
}
