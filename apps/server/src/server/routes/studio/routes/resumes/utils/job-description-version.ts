import { and, desc, eq } from "drizzle-orm";
import type { db } from "../../../../../../lib/server/db/index";
import { jobDescription, jobDescriptionVersion } from "@app/db-schema/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface CurrentJobDescriptionVersion {
  id: string;
  jobDescriptionName: string;
  prompt: string;
  version: number;
}

export async function ensureCurrentJobDescriptionVersion(
  tx: Tx,
  input: { jobDescriptionId: string; organizationId: string },
): Promise<CurrentJobDescriptionVersion | null> {
  const [currentJob] = await tx
    .select({
      lifecycleStatus: jobDescription.lifecycleStatus,
      name: jobDescription.name,
      prompt: jobDescription.prompt,
    })
    .from(jobDescription)
    .where(
      and(
        eq(jobDescription.id, input.jobDescriptionId),
        eq(jobDescription.organizationId, input.organizationId),
      ),
    )
    .limit(1)
    .for("update");
  if (!currentJob || currentJob.lifecycleStatus !== "published") {
    return null;
  }

  let [snapshot] = await tx
    .select({
      id: jobDescriptionVersion.id,
      jobDescriptionName: jobDescriptionVersion.jobDescriptionName,
      prompt: jobDescriptionVersion.prompt,
      version: jobDescriptionVersion.version,
    })
    .from(jobDescriptionVersion)
    .where(eq(jobDescriptionVersion.jobDescriptionId, input.jobDescriptionId))
    .orderBy(desc(jobDescriptionVersion.version))
    .limit(1);
  if (
    !snapshot ||
    snapshot.prompt !== currentJob.prompt ||
    snapshot.jobDescriptionName !== currentJob.name
  ) {
    const [created] = await tx
      .insert(jobDescriptionVersion)
      .values({
        createdAt: new Date(),
        createdBy: null,
        id: crypto.randomUUID(),
        jobDescriptionId: input.jobDescriptionId,
        jobDescriptionName: currentJob.name,
        organizationId: input.organizationId,
        prompt: currentJob.prompt,
        version: (snapshot?.version ?? 0) + 1,
      })
      .returning({
        id: jobDescriptionVersion.id,
        jobDescriptionName: jobDescriptionVersion.jobDescriptionName,
        prompt: jobDescriptionVersion.prompt,
        version: jobDescriptionVersion.version,
      });
    snapshot = created;
  }
  return snapshot ?? null;
}
