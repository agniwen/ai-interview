import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  department,
  jobDescription,
  organization,
  referralLink,
  user,
} from "@arc/db-schema/schema";
import {
  createJobDescriptionReferralLink,
  resolveReferralLink,
  toPublicReferralPreview,
} from "./referral-links";

const ORG_ID = "referral_link_org";
const USER_ID = "referral_link_user";
const DEPARTMENT_ID = "referral_link_department";
const JD_ID = "referral_link_jd";
const NOW = new Date("2026-06-23T09:00:00.000Z");

async function cleanup() {
  await db.delete(referralLink).where(eq(referralLink.organizationId, ORG_ID));
  await db.delete(jobDescription).where(eq(jobDescription.organizationId, ORG_ID));
  await db.delete(department).where(eq(department.organizationId, ORG_ID));
  await db.delete(organization).where(eq(organization.id, ORG_ID));
  await db.delete(user).where(eq(user.id, USER_ID));
}

async function seedFixtures() {
  await db.insert(user).values({
    createdAt: NOW,
    email: "referrer@example.com",
    emailVerified: false,
    id: USER_ID,
    name: "张三",
    updatedAt: NOW,
  });
  await db.insert(organization).values({
    createdAt: NOW,
    id: ORG_ID,
    name: "明日科技",
    slug: "referral-link-org",
  });
  await db.insert(department).values({
    createdAt: NOW,
    createdBy: USER_ID,
    id: DEPARTMENT_ID,
    name: "产品研发部",
    organizationId: ORG_ID,
    updatedAt: NOW,
  });
  await db.insert(jobDescription).values({
    code: "FE-2026",
    createdAt: NOW,
    createdBy: USER_ID,
    departmentId: DEPARTMENT_ID,
    id: JD_ID,
    name: "前端工程师",
    organizationId: ORG_ID,
    prompt: "负责前端工程化与业务开发。",
    updatedAt: NOW,
  });
}

beforeAll(async () => {
  await cleanup();
});

afterAll(cleanup);

beforeEach(async () => {
  await cleanup();
  await seedFixtures();
});

describe("referral links", () => {
  it("resolves a created referral link with JD, company and referrer metadata", async () => {
    const { token } = await createJobDescriptionReferralLink({
      createdBy: USER_ID,
      jobDescriptionId: JD_ID,
      organizationId: ORG_ID,
    });

    const resolved = await resolveReferralLink(token);

    expect(resolved).toMatchObject({
      createdBy: USER_ID,
      jobDescriptionCode: "FE-2026",
      jobDescriptionId: JD_ID,
      jobDescriptionName: "前端工程师",
      organizationId: ORG_ID,
      organizationName: "明日科技",
      referrerName: "张三",
    });
    if (!resolved) {
      throw new Error("Expected referral link to resolve");
    }
    expect(toPublicReferralPreview(resolved)).toEqual({
      companyName: "明日科技",
      jobDescriptionCode: "FE-2026",
      jobDescriptionName: "前端工程师",
      referrerName: "张三",
    });
  });

  it("does not resolve disabled referral links", async () => {
    const { token } = await createJobDescriptionReferralLink({
      createdBy: USER_ID,
      jobDescriptionId: JD_ID,
      organizationId: ORG_ID,
    });
    await db
      .update(referralLink)
      .set({ disabledAt: NOW, disabledBy: USER_ID })
      .where(eq(referralLink.organizationId, ORG_ID));

    await expect(resolveReferralLink(token)).resolves.toBeNull();
  });
});
