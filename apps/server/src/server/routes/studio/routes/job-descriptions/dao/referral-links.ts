import { and, eq, isNull } from "drizzle-orm";
import type { PublicReferralPreview } from "@app/shared/referrals";
import { sha256HexOfBytes } from "@app/shared/file-hash";
import { db } from "@server/lib/server/db/index";
import { jobDescription, organization, referralLink, user } from "@app/db-schema/schema";

const TOKEN_BYTES = 32;

function hashReferralToken(token: string): Promise<string> {
  return sha256HexOfBytes(new TextEncoder().encode(token));
}

function createReferralToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface ResolvedReferralLink {
  createdBy: string;
  jobDescriptionCode: string | null;
  jobDescriptionId: string;
  jobDescriptionName: string;
  organizationId: string;
  organizationName: string;
  referrerName: string | null;
}

export async function createJobDescriptionReferralLink(input: {
  createdBy: string;
  jobDescriptionId: string;
  organizationId: string;
}): Promise<{ token: string }> {
  const [publishedJob] = await db
    .select({ id: jobDescription.id })
    .from(jobDescription)
    .where(
      and(
        eq(jobDescription.id, input.jobDescriptionId),
        eq(jobDescription.organizationId, input.organizationId),
        eq(jobDescription.lifecycleStatus, "published"),
      ),
    )
    .limit(1);
  if (!publishedJob) {
    throw new Error("JOB_NOT_PUBLISHED");
  }
  const token = createReferralToken();
  const tokenHash = await hashReferralToken(token);
  const now = new Date();
  await db.insert(referralLink).values({
    createdAt: now,
    createdBy: input.createdBy,
    id: crypto.randomUUID(),
    jobDescriptionId: input.jobDescriptionId,
    organizationId: input.organizationId,
    tokenHash,
    updatedAt: now,
  });
  return { token };
}

export async function resolveReferralLink(token: string): Promise<ResolvedReferralLink | null> {
  const tokenHash = await hashReferralToken(token);
  const [row] = await db
    .select({
      createdBy: referralLink.createdBy,
      jobDescriptionCode: jobDescription.code,
      jobDescriptionId: referralLink.jobDescriptionId,
      jobDescriptionName: jobDescription.name,
      organizationId: referralLink.organizationId,
      organizationName: organization.name,
      referrerName: user.name,
    })
    .from(referralLink)
    .innerJoin(
      jobDescription,
      and(
        eq(referralLink.jobDescriptionId, jobDescription.id),
        eq(referralLink.organizationId, jobDescription.organizationId),
      ),
    )
    .innerJoin(organization, eq(referralLink.organizationId, organization.id))
    .leftJoin(user, eq(referralLink.createdBy, user.id))
    .where(
      and(
        eq(referralLink.tokenHash, tokenHash),
        isNull(referralLink.disabledAt),
        eq(jobDescription.lifecycleStatus, "published"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export function toPublicReferralPreview(link: ResolvedReferralLink): PublicReferralPreview {
  return {
    companyName: link.organizationName,
    jobDescriptionCode: link.jobDescriptionCode,
    jobDescriptionName: link.jobDescriptionName,
    referrerName: link.referrerName,
  };
}
