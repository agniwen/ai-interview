import {
  externalApplicationLink,
  jobDescription,
  member,
  organization,
} from "@app/db-schema/schema";
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
