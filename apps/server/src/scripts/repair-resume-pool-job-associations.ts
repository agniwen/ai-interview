import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { pathToFileURL } from "node:url";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import type { Database } from "../lib/server/db/index";
import {
  jobDescription,
  resumePoolEvent,
  recruitingPoolImport,
  resumePoolItem,
} from "@app/db-schema/schema";
import { loadStandaloneEnv } from "../standalone/env";

export interface ResumePoolJobAssociationRepairCandidate {
  candidateName: string;
  jobDescriptionId: string;
  jobDescriptionName: string;
  organizationId: string;
  poolItemId: string;
}

export interface ResumePoolJobAssociationRepairResult {
  candidateCount: number;
  candidates: ResumePoolJobAssociationRepairCandidate[];
  updatedCount: number;
}

interface RepairCandidateRow extends ResumePoolJobAssociationRepairCandidate {
  importedBy: string | null;
}

async function loadRepairCandidates(
  db: Database,
  organizationId?: string,
): Promise<RepairCandidateRow[]> {
  const rows = await db
    .selectDistinctOn([recruitingPoolImport.poolItemId], {
      candidateName: resumePoolItem.candidateName,
      importedBy: recruitingPoolImport.importedBy,
      jobDescriptionId: recruitingRecordReadModel.jobDescriptionId,
      jobDescriptionName: jobDescription.name,
      organizationId: recruitingPoolImport.organizationId,
      poolItemId: recruitingPoolImport.poolItemId,
    })
    .from(recruitingPoolImport)
    .innerJoin(
      resumePoolItem,
      and(
        eq(resumePoolItem.id, recruitingPoolImport.poolItemId),
        eq(resumePoolItem.organizationId, recruitingPoolImport.organizationId),
      ),
    )
    .innerJoin(
      recruitingRecordReadModel,
      and(
        eq(recruitingRecordReadModel.id, recruitingPoolImport.recruitingRecordId),
        eq(recruitingRecordReadModel.organizationId, recruitingPoolImport.organizationId),
      ),
    )
    .innerJoin(
      jobDescription,
      and(
        eq(jobDescription.id, recruitingRecordReadModel.jobDescriptionId),
        eq(jobDescription.organizationId, recruitingPoolImport.organizationId),
      ),
    )
    .where(
      and(
        eq(resumePoolItem.status, "active"),
        isNull(resumePoolItem.jobDescriptionId),
        isNotNull(recruitingRecordReadModel.jobDescriptionId),
        organizationId ? eq(recruitingPoolImport.organizationId, organizationId) : undefined,
      ),
    )
    .orderBy(
      recruitingPoolImport.poolItemId,
      desc(recruitingPoolImport.importedAt),
      desc(recruitingPoolImport.id),
    );

  return rows.flatMap((row) =>
    row.jobDescriptionId
      ? [
          {
            ...row,
            jobDescriptionId: row.jobDescriptionId,
          },
        ]
      : [],
  );
}

export async function repairResumePoolJobAssociations(input: {
  apply: boolean;
  db: Database;
  organizationId?: string;
}): Promise<ResumePoolJobAssociationRepairResult> {
  const candidates = await loadRepairCandidates(input.db, input.organizationId);
  if (!input.apply) {
    return { candidateCount: candidates.length, candidates, updatedCount: 0 };
  }

  const updatedCount = await input.db.transaction(async (tx) => {
    let count = 0;
    for (const candidate of candidates) {
      const updated = await tx
        .update(resumePoolItem)
        .set({ jobDescriptionId: candidate.jobDescriptionId, updatedAt: new Date() })
        .where(
          and(
            eq(resumePoolItem.id, candidate.poolItemId),
            eq(resumePoolItem.organizationId, candidate.organizationId),
            isNull(resumePoolItem.jobDescriptionId),
          ),
        )
        .returning({ id: resumePoolItem.id });
      if (updated.length === 0) {
        continue;
      }
      await tx.insert(resumePoolEvent).values({
        actorId: candidate.importedBy,
        id: crypto.randomUUID(),
        organizationId: candidate.organizationId,
        payload: {
          jobDescriptionId: candidate.jobDescriptionId,
          source: "resume_pool_job_association_repair",
        },
        poolItemId: candidate.poolItemId,
        type: "bound",
      });
      count += 1;
    }
    return count;
  });

  return { candidateCount: candidates.length, candidates, updatedCount };
}

function loadScriptEnv(): void {
  loadStandaloneEnv();
}

function printResult(result: ResumePoolJobAssociationRepairResult, apply: boolean): void {
  console.log(
    apply ? "Resume pool job association repair complete." : "Resume pool job repair preview.",
  );
  console.log(`- candidates: ${result.candidateCount}`);
  console.log(`- updated: ${result.updatedCount}`);
  for (const candidate of result.candidates) {
    console.log(
      `- ${candidate.candidateName} (${candidate.poolItemId}) -> ${candidate.jobDescriptionName} (${candidate.jobDescriptionId})`,
    );
  }
  if (!apply && result.candidateCount > 0) {
    console.log("Run again with --apply to write these changes.");
  }
}

export async function runResumePoolJobAssociationRepairCli(
  args: string[] = process.argv.slice(2),
): Promise<void> {
  loadScriptEnv();
  const { closeDatabase, db } = await import("../lib/server/db/index");
  try {
    const apply = args.includes("--apply");
    const result = await repairResumePoolJobAssociations({ apply, db });
    printResult(result, apply);
  } finally {
    await closeDatabase();
  }
}

function isDirectRun(): boolean {
  const [, entry] = process.argv;
  return Boolean(entry && import.meta.url === pathToFileURL(entry).href);
}

if (isDirectRun()) {
  try {
    await runResumePoolJobAssociationRepairCli();
  } catch (error) {
    console.error("Resume pool job association repair failed.");
    console.error(error);
    process.exitCode = 1;
  }
}
