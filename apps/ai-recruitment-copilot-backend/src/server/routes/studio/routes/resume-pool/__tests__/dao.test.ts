import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  member,
  organization,
  resumePoolImport,
  resumePoolItem,
  studioInterview,
  user,
} from "@arc/db-schema/schema";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import {
  createResumePoolItem,
  deletePrivatePoolItem,
  importPoolItemToResumeLibrary,
  publishPrivatePoolItem,
  queryResumePoolItems,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-pool/dao";

const ORG_A = "resume_pool_org_a";
const ORG_B = "resume_pool_org_b";
const USER_A = "resume_pool_user_a";
const USER_B = "resume_pool_user_b";
const NOW = new Date("2026-06-14T09:00:00.000Z");

const PROFILE: ResumeProfile = {
  age: null,
  email: "candidate@example.com",
  gender: null,
  name: "候选人甲",
  personalStrengths: ["沟通清晰"],
  phone: "13800138000",
  projectExperiences: [],
  schools: [],
  skills: ["React", "TypeScript"],
  targetRoles: ["前端工程师"],
  workExperiences: [],
  workYears: 5,
};

async function cleanup() {
  await db.delete(resumePoolImport).where(eq(resumePoolImport.organizationId, ORG_A));
  await db.delete(resumePoolImport).where(eq(resumePoolImport.organizationId, ORG_B));
  await db.delete(resumePoolItem).where(eq(resumePoolItem.organizationId, ORG_A));
  await db.delete(resumePoolItem).where(eq(resumePoolItem.organizationId, ORG_B));
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG_A));
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG_B));
  await db.delete(member).where(eq(member.userId, USER_A));
  await db.delete(member).where(eq(member.userId, USER_B));
  await db.delete(organization).where(eq(organization.id, ORG_A));
  await db.delete(organization).where(eq(organization.id, ORG_B));
  await db.delete(user).where(eq(user.id, USER_A));
  await db.delete(user).where(eq(user.id, USER_B));
}

beforeAll(async () => {
  await cleanup();
  await db.insert(user).values([
    {
      createdAt: NOW,
      email: "resume-pool-a@example.com",
      emailVerified: false,
      id: USER_A,
      name: "resume-pool-a",
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      email: "resume-pool-b@example.com",
      emailVerified: false,
      id: USER_B,
      name: "resume-pool-b",
      updatedAt: NOW,
    },
  ]);
  await db.insert(organization).values([
    { createdAt: NOW, id: ORG_A, name: "Resume Pool Org A", slug: "resume-pool-org-a" },
    { createdAt: NOW, id: ORG_B, name: "Resume Pool Org B", slug: "resume-pool-org-b" },
  ]);
  await db.insert(member).values([
    {
      createdAt: NOW,
      id: "resume_pool_member_a",
      organizationId: ORG_A,
      role: "owner",
      userId: USER_A,
    },
    {
      createdAt: NOW,
      id: "resume_pool_member_b",
      organizationId: ORG_B,
      role: "owner",
      userId: USER_B,
    },
  ]);
});

afterAll(cleanup);

function basePoolInput(overrides: Partial<Parameters<typeof createResumePoolItem>[0]> = {}) {
  return {
    candidateEmail: PROFILE.email,
    candidateName: PROFILE.name,
    candidatePhone: PROFILE.phone,
    contentHash: "hash-resume-pool-1",
    createdBy: USER_A,
    jobDescriptionId: null,
    notes: "简历池备注",
    organizationId: ORG_A,
    resumeFileName: "candidate.pdf",
    resumeProfile: PROFILE,
    scope: "private" as const,
    storageKey: "attachments/resume-pool/candidate.pdf",
    targetRole: "前端工程师",
    ...overrides,
  };
}

describe("queryResumePoolItems", () => {
  it("only lists the current user's private items in the current organization", async () => {
    await createResumePoolItem(basePoolInput());
    await createResumePoolItem(basePoolInput({ createdBy: USER_B, organizationId: ORG_A }));
    await createResumePoolItem(basePoolInput({ createdBy: USER_A, organizationId: ORG_B }));

    const result = await queryResumePoolItems({
      organizationId: ORG_A,
      scope: "private",
      userId: USER_A,
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.candidateName).toBe("候选人甲");
    expect(result.records[0]?.scope).toBe("private");
  });

  it("lists public items across organizations", async () => {
    await createResumePoolItem(basePoolInput({ scope: "public" }));
    await createResumePoolItem(
      basePoolInput({ createdBy: USER_B, organizationId: ORG_B, scope: "public" }),
    );

    const result = await queryResumePoolItems({
      organizationId: ORG_A,
      scope: "public",
      userId: USER_A,
    });

    const orgIds = result.records.map((record) => record.organizationId).toSorted();
    expect(orgIds).toEqual([ORG_A, ORG_B].toSorted());
  });
});

describe("publishPrivatePoolItem", () => {
  it("copies a private item to public and leaves the original private item unchanged", async () => {
    const privateId = await createResumePoolItem(basePoolInput());

    const publicItem = await publishPrivatePoolItem({
      organizationId: ORG_A,
      poolItemId: privateId,
      userId: USER_A,
    });

    expect(publicItem.scope).toBe("public");
    expect(publicItem.sourcePoolItemId).toBe(privateId);
    expect(publicItem.sourceOrganizationId).toBe(ORG_A);
    expect(publicItem.sourceUserId).toBe(USER_A);

    const [privateItem] = await db
      .select()
      .from(resumePoolItem)
      .where(eq(resumePoolItem.id, privateId));
    expect(privateItem?.scope).toBe("private");
    expect(privateItem?.status).toBe("active");
  });
});

describe("importPoolItemToResumeLibrary", () => {
  it("imports a public item into the current organization's resume library", async () => {
    const publicId = await createResumePoolItem(basePoolInput({ scope: "public" }));

    const result = await importPoolItemToResumeLibrary({
      dedupPolicy: "force",
      importedBy: USER_B,
      jobDescriptionId: null,
      organizationId: ORG_B,
      poolItemId: publicId,
    });

    expect(result.status).toBe("imported");
    if (result.status !== "imported") {
      throw new Error("expected import success");
    }
    const [record] = await db
      .select()
      .from(studioInterview)
      .where(eq(studioInterview.id, result.resumeRecordId));
    expect(record?.organizationId).toBe(ORG_B);
    expect(record?.candidateName).toBe(PROFILE.name);
    expect(record?.resumeSourceType).toBe("public_pool");
    expect(record?.resumeSourcePoolItemId).toBe(publicId);

    const imports = await db
      .select()
      .from(resumePoolImport)
      .where(eq(resumePoolImport.importedResumeRecordId, result.resumeRecordId));
    expect(imports).toHaveLength(1);
    expect(imports[0]?.organizationId).toBe(ORG_B);
  });

  it("rejects importing another user's private item", async () => {
    const privateId = await createResumePoolItem(basePoolInput());

    await expect(
      importPoolItemToResumeLibrary({
        dedupPolicy: "force",
        importedBy: USER_B,
        jobDescriptionId: null,
        organizationId: ORG_A,
        poolItemId: privateId,
      }),
    ).rejects.toThrow("简历池记录不存在或无权访问");
  });
});

describe("deletePrivatePoolItem", () => {
  it("hard-deletes the owner's private pool item and keeps imported resume records", async () => {
    const privateId = await createResumePoolItem(basePoolInput());
    const imported = await importPoolItemToResumeLibrary({
      dedupPolicy: "force",
      importedBy: USER_A,
      jobDescriptionId: null,
      organizationId: ORG_A,
      poolItemId: privateId,
    });
    if (imported.status !== "imported") {
      throw new Error("expected import success");
    }

    await deletePrivatePoolItem({
      organizationId: ORG_A,
      poolItemId: privateId,
      userId: USER_A,
    });

    const poolRows = await db.select().from(resumePoolItem).where(eq(resumePoolItem.id, privateId));
    expect(poolRows).toHaveLength(0);

    const [record] = await db
      .select()
      .from(studioInterview)
      .where(eq(studioInterview.id, imported.resumeRecordId));
    expect(record?.candidateName).toBe(PROFILE.name);
    expect(record?.resumeSourceType).toBe("private_pool");
    expect(record?.resumeSourcePoolItemId).toBeNull();
  });

  it("rejects deleting public items or another user's private items", async () => {
    const publicId = await createResumePoolItem(basePoolInput({ scope: "public" }));
    const otherPrivateId = await createResumePoolItem(
      basePoolInput({ createdBy: USER_B, organizationId: ORG_A }),
    );

    await expect(
      deletePrivatePoolItem({
        organizationId: ORG_A,
        poolItemId: publicId,
        userId: USER_A,
      }),
    ).rejects.toThrow("私有简历不存在或无权删除");
    await expect(
      deletePrivatePoolItem({
        organizationId: ORG_A,
        poolItemId: otherPrivateId,
        userId: USER_A,
      }),
    ).rejects.toThrow("私有简历不存在或无权删除");
  });
});
