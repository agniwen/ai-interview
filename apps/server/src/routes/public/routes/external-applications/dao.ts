import {
  externalApplicationLink,
  jobDescription,
  member,
  organization,
  recruitingUploadBatch,
  recruitingUploadBatchItem,
  resumePoolItem,
} from "@app/db-schema/schema";
import { resumeUploadRequestId } from "@app/resume-processing/ingest";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../../../../infrastructure/db/index";

export async function resolveExternalApplicationLink(token: string) {
  const [link] = await db
    .select({ name: organization.name, organizationId: organization.id })
    .from(externalApplicationLink)
    .innerJoin(organization, eq(externalApplicationLink.organizationId, organization.id))
    .where(
      and(eq(externalApplicationLink.token, token), eq(externalApplicationLink.enabled, true)),
    );
  return link;
}

export function listExternalApplicationJobs(organizationId: string) {
  return db
    .select({ id: jobDescription.id, jd: jobDescription.prompt, name: jobDescription.name })
    .from(jobDescription)
    .where(
      and(
        eq(jobDescription.organizationId, organizationId),
        eq(jobDescription.lifecycleStatus, "published"),
        eq(jobDescription.recruitingStatus, "active"),
      ),
    )
    .orderBy(asc(jobDescription.name), asc(jobDescription.id));
}

export async function resolveExternalApplicationActor(organizationId: string) {
  const [owner] = await db
    .select({ userId: member.userId })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.role, "owner")))
    .orderBy(asc(member.createdAt), asc(member.id))
    .limit(1);
  return owner?.userId;
}

export async function resolveExternalApplicationSubmission(token: string, requestId: string) {
  const link = await resolveExternalApplicationLink(token);
  if (!link) {
    return null;
  }
  const actorId = await resolveExternalApplicationActor(link.organizationId);
  if (!actorId) {
    return null;
  }
  const batchId = resumeUploadRequestId(
    "batch",
    link.organizationId,
    actorId,
    `external-application:${requestId}`,
  );
  const [row] = await db
    .select({ poolItemId: resumePoolItem.id })
    .from(recruitingUploadBatchItem)
    .innerJoin(
      recruitingUploadBatch,
      eq(recruitingUploadBatchItem.batchId, recruitingUploadBatch.id),
    )
    .innerJoin(resumePoolItem, eq(recruitingUploadBatchItem.poolItemId, resumePoolItem.id))
    .where(
      and(
        eq(recruitingUploadBatch.id, batchId),
        eq(recruitingUploadBatch.organizationId, link.organizationId),
        eq(resumePoolItem.organizationId, link.organizationId),
        eq(resumePoolItem.sourceChannel, "external_application"),
      ),
    )
    .limit(1);
  if (!row) {
    return null;
  }
  return {
    actorId,
    organizationId: link.organizationId,
    poolItemId: row.poolItemId,
  };
}
