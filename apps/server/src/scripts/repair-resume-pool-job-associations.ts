import { pathToFileURL } from "node:url";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import type { Database } from "@app/server/lib/server/db";
import {
  jobDescription,
  resumePoolEvent,
  resumePoolImport,
  resumePoolItem,
  studioInterview,
} from "@arc/db-schema/schema";
import { loadStandaloneEnv, loadWebEnv } from "../standalone/env";

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
    .selectDistinctOn([resumePoolImport.poolItemId], {
      candidateName: resumePoolItem.candidateName,
      importedBy: resumePoolImport.importedBy,
      jobDescriptionId: studioInterview.jobDescriptionId,
      jobDescriptionName: jobDescription.name,
      organizationId: resumePoolImport.organizationId,
      poolItemId: resumePoolImport.poolItemId,
    })
    .from(resumePoolImport)
    .innerJoin(
      resumePoolItem,
      and(
        eq(resumePoolItem.id, resumePoolImport.poolItemId),
        eq(resumePoolItem.organizationId, resumePoolImport.organizationId),
      ),
    )
    .innerJoin(
      studioInterview,
      and(
        eq(studioInterview.id, resumePoolImport.importedResumeRecordId),
        eq(studioInterview.organizationId, resumePoolImport.organizationId),
      ),
    )
    .innerJoin(
      jobDescription,
      and(
        eq(jobDescription.id, studioInterview.jobDescriptionId),
        eq(jobDescription.organizationId, resumePoolImport.organizationId),
      ),
    )
    .where(
      and(
        eq(resumePoolItem.status, "active"),
        isNull(resumePoolItem.jobDescriptionId),
        isNotNull(studioInterview.jobDescriptionId),
        organizationId ? eq(resumePoolImport.organizationId, organizationId) : undefined,
      ),
    )
    .orderBy(
      resumePoolImport.poolItemId,
      desc(resumePoolImport.importedAt),
      desc(resumePoolImport.id),
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
  loadWebEnv();
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
  const { closeDatabase, db } = await import("@app/server/lib/server/db");
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
