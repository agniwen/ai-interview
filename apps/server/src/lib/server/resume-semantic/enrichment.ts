import { and, eq } from "drizzle-orm";
import { db } from "../db/index";
import { resumePoolItem, studioInterview } from "@arc/db-schema/schema";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type { ResumePoolScope } from "@arc/db-schema/schema";
import type { ResumeSemanticIndexJobData } from "@arc/resume-parse-queue/resume-semantic-index";
import { findSemanticResumeDuplicates } from "./dedup-service";
import { replaceDuplicateMatchesForSource } from "./duplicate-matches";
import { runResumeSemanticIndexJob } from "./indexer";

interface SemanticEnrichmentSource {
  createdBy: string | null;
  profile: ResumeProfile;
  scope: ResumePoolScope | null;
}

interface ResumeSemanticEnrichmentDeps {
  findDuplicates: typeof findSemanticResumeDuplicates;
  index: typeof runResumeSemanticIndexJob;
  loadSource: (job: ResumeSemanticIndexJobData) => Promise<SemanticEnrichmentSource | null>;
  replaceDuplicateSnapshot: typeof replaceDuplicateMatchesForSource;
}

async function loadSemanticEnrichmentSource(
  job: ResumeSemanticIndexJobData,
): Promise<SemanticEnrichmentSource | null> {
  if (job.sourceType === "studio_interview") {
    const [row] = await db
      .select({ profile: studioInterview.resumeProfile })
      .from(studioInterview)
      .where(
        and(
          eq(studioInterview.id, job.sourceId),
          eq(studioInterview.organizationId, job.organizationId),
        ),
      )
      .limit(1);
    return row?.profile ? { createdBy: null, profile: row.profile, scope: null } : null;
  }
  if (job.sourceType !== "resume_pool_item") {
    return null;
  }
  const [row] = await db
    .select({
      createdBy: resumePoolItem.createdBy,
      profile: resumePoolItem.resumeProfile,
      scope: resumePoolItem.scope,
    })
    .from(resumePoolItem)
    .where(
      and(
        eq(resumePoolItem.id, job.sourceId),
        eq(resumePoolItem.organizationId, job.organizationId),
      ),
    )
    .limit(1);
  return row?.profile ? { createdBy: row.createdBy, profile: row.profile, scope: row.scope } : null;
}

const defaultDeps: ResumeSemanticEnrichmentDeps = {
  findDuplicates: findSemanticResumeDuplicates,
  index: runResumeSemanticIndexJob,
  loadSource: loadSemanticEnrichmentSource,
  replaceDuplicateSnapshot: replaceDuplicateMatchesForSource,
};

export async function runResumeSemanticEnrichmentJob(
  job: ResumeSemanticIndexJobData,
  deps: ResumeSemanticEnrichmentDeps = defaultDeps,
): Promise<void> {
  await deps.index(job);
  const source = await deps.loadSource(job);
  if (!source || job.sourceType === "job_description") {
    return;
  }
  const privatePool = job.sourceType === "resume_pool_item" && source.scope === "private";
  const matches = await deps.findDuplicates({
    excludeSources: [{ sourceId: job.sourceId, sourceType: job.sourceType }],
    organizationId: job.organizationId,
    poolOwnerUserId: privatePool ? source.createdBy : undefined,
    poolScope: privatePool ? "private" : undefined,
    resumeProfile: source.profile,
    sourceTypes: privatePool ? ["studio_interview", "resume_pool_item"] : ["studio_interview"],
    throwOnError: true,
  });
  await deps.replaceDuplicateSnapshot({
    matches,
    organizationId: job.organizationId,
    sourceId: job.sourceId,
    sourceType: job.sourceType,
  });
}
