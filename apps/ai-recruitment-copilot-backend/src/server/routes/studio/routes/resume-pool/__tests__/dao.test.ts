import { and, eq, or } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  mailIngestAccount,
  mailIngestMessage,
  member,
  organization,
  resumeDuplicateMatch,
  resumePoolImport,
  resumePoolItem,
  resumeUploadBatch,
  resumeUploadBatchItem,
  studioInterview,
  user,
} from "@arc/db-schema/schema";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import {
  createResumePoolItem,
  deleteOwnPoolItem,
  importPoolItemToResumeLibrary,
  loadResumePoolItem,
  markResumePoolItemParsed,
  publishPrivatePoolItem,
  queryResumePoolItems,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-pool/dao";
import { enqueueResumeSemanticIndexJobBestEffort } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/enqueue";
import { findSemanticResumeDuplicates } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/dedup-service";
import { deleteResumeSemanticIndexBestEffort } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/lifecycle";
import { cloneResumeSemanticIndexFromPoolToInterview } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/clone";

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/enqueue", () => ({
  enqueueResumeSemanticIndexJobBestEffort: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/dedup-service", () => ({
  findSemanticResumeDuplicates: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/lifecycle", () => ({
  deleteResumeSemanticIndexBestEffort: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/clone", () => ({
  cloneResumeSemanticIndexFromPoolToInterview: vi.fn(),
}));

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

const PROFILE_WITH_HIGHLIGHTS: ResumeProfile = {
  ...PROFILE,
  projectExperiences: [
    {
      name: "智能招聘看板",
      period: "2025.01-2025.05",
      role: "负责人",
      summary: "负责候选人数据分析与可视化。",
      techStack: ["React"],
    },
    {
      name: "旧项目",
      period: "2024.01-2024.05",
      role: "成员",
      summary: "历史项目。",
      techStack: [],
    },
  ],
  schools: ["华南农业大学", "长沙理工大学"],
  workExperiences: [
    {
      company: "极光矩阵",
      period: "2025.02-至今",
      role: "前端工程师",
      summary: "负责 AI 招聘产品前端。",
    },
    {
      company: "旧公司",
      period: "2023.01-2024.01",
      role: "实习生",
      summary: "历史经历。",
    },
  ],
};

async function cleanup() {
  await db
    .delete(mailIngestMessage)
    .where(eq(mailIngestMessage.accountId, "resume_pool_mail_account"));
  await db.delete(mailIngestAccount).where(eq(mailIngestAccount.id, "resume_pool_mail_account"));
  await db.delete(resumeUploadBatchItem).where(eq(resumeUploadBatchItem.organizationId, ORG_A));
  await db.delete(resumeUploadBatch).where(eq(resumeUploadBatch.organizationId, ORG_A));
  await db.delete(resumeDuplicateMatch).where(eq(resumeDuplicateMatch.organizationId, ORG_A));
  await db.delete(resumeDuplicateMatch).where(eq(resumeDuplicateMatch.organizationId, ORG_B));
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

beforeEach(() => {
  vi.mocked(enqueueResumeSemanticIndexJobBestEffort).mockClear();
  vi.mocked(findSemanticResumeDuplicates).mockResolvedValue([]);
  vi.mocked(deleteResumeSemanticIndexBestEffort).mockClear();
  vi.mocked(cloneResumeSemanticIndexFromPoolToInterview).mockResolvedValue();
});

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
    resumeText: "候选人甲 OCR 原文",
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

    const orgIds = result.records.map((record) => record.organizationId);
    expect(orgIds).toEqual(expect.arrayContaining([ORG_A, ORG_B]));
  });

  it("includes profile highlights for resume pool cards", async () => {
    const id = await createResumePoolItem(
      basePoolInput({
        contentHash: "hash-resume-pool-highlights",
        resumeFileName: "candidate-highlights.pdf",
        resumeProfile: PROFILE_WITH_HIGHLIGHTS,
      }),
    );

    const result = await queryResumePoolItems({
      organizationId: ORG_A,
      scope: "private",
      userId: USER_A,
    });

    const record = result.records.find((item) => item.id === id);
    expect(record?.workYears).toBe(5);
    expect(record?.profileHighlights).toEqual({
      educationItems: [],
      educationLines: [],
      latestCompany: "极光矩阵",
      latestProject: "智能招聘看板",
      schools: ["华南农业大学", "长沙理工大学"],
    });
    expect(record?.masteredSkills).toEqual(["React", "TypeScript"]);
  });

  it("includes active duplicate match summary for private pool items", async () => {
    const id = await createResumePoolItem(
      basePoolInput({
        contentHash: "hash-resume-pool-duplicate-summary",
        resumeFileName: "candidate-duplicate-summary.pdf",
      }),
    );
    await db.insert(resumeDuplicateMatch).values([
      {
        embeddingVersion: "test-v1",
        id: "resume_pool_duplicate_active",
        level: "medium",
        matchedSourceId: "existing_resume_record",
        matchedSourceType: "studio_interview",
        organizationId: ORG_A,
        reasons: ["项目经历相似"],
        score: 88,
        sourceId: id,
        sourceType: "resume_pool_item",
        status: "active",
      },
      {
        embeddingVersion: "test-v1",
        id: "resume_pool_duplicate_dismissed",
        level: "high",
        matchedSourceId: "dismissed_resume_record",
        matchedSourceType: "studio_interview",
        organizationId: ORG_A,
        reasons: ["已忽略"],
        score: 93,
        sourceId: id,
        sourceType: "resume_pool_item",
        status: "dismissed",
      },
    ]);

    try {
      const result = await queryResumePoolItems({
        organizationId: ORG_A,
        scope: "private",
        userId: USER_A,
      });
      expect(result.records.find((item) => item.id === id)?.duplicateMatch).toEqual({
        count: 1,
        highestLevel: "medium",
      });

      const detail = await loadResumePoolItem({
        organizationId: ORG_A,
        poolItemId: id,
        userId: USER_A,
      });
      expect(detail?.duplicateMatch).toEqual({ count: 1, highestLevel: "medium" });
    } finally {
      await db.delete(resumeDuplicateMatch).where(eq(resumeDuplicateMatch.organizationId, ORG_A));
    }
  });

  it("includes uploader organization and user display names", async () => {
    const id = await createResumePoolItem(
      basePoolInput({
        contentHash: "hash-resume-pool-uploader-meta",
        resumeFileName: "candidate-uploader-meta.pdf",
        scope: "public",
      }),
    );

    const result = await queryResumePoolItems({
      organizationId: ORG_A,
      scope: "public",
      userId: USER_A,
    });
    const record = result.records.find((item) => item.id === id);

    expect(record?.uploaderOrganizationName).toBe("Resume Pool Org A");
    expect(record?.uploaderName).toBe("resume-pool-a");
    expect(record?.uploaderEmail).toBe("resume-pool-a@example.com");

    const detail = await loadResumePoolItem({
      organizationId: ORG_A,
      poolItemId: id,
      userId: USER_A,
    });

    expect(detail?.uploaderOrganizationName).toBe("Resume Pool Org A");
    expect(detail?.uploaderName).toBe("resume-pool-a");
    expect(detail?.uploaderEmail).toBe("resume-pool-a@example.com");
  });

  it("marks pool items created from mail ingest as email push source", async () => {
    const poolItemId = await createResumePoolItem(
      basePoolInput({
        contentHash: "hash-resume-pool-mail-ingest",
        resumeFileName: "candidate-mail-ingest.pdf",
      }),
    );
    await db.insert(resumeUploadBatch).values({
      createdAt: NOW,
      createdBy: USER_A,
      dedupPolicy: "skip",
      id: "resume_pool_mail_batch",
      jdMode: "none",
      jobDescriptionId: null,
      organizationId: ORG_A,
      resumePoolScope: "private",
      status: "pending",
      target: "resume_pool",
      totalCount: 1,
      updatedAt: NOW,
    });
    await db.insert(resumeUploadBatchItem).values({
      batchId: "resume_pool_mail_batch",
      contentHash: "hash-resume-pool-mail-ingest",
      fileSize: 1024,
      id: "resume_pool_mail_batch_item",
      orderIndex: 0,
      organizationId: ORG_A,
      originalFileName: "candidate-mail-ingest.pdf",
      poolItemId,
      status: "succeeded",
      storageKey: "attachments/resume-pool/candidate-mail-ingest.pdf",
    });
    await db.insert(mailIngestAccount).values({
      createdAt: NOW,
      emailAddress: "hr@example.com",
      encryptedPassword: "encrypted",
      id: "resume_pool_mail_account",
      organizationId: ORG_A,
      updatedAt: NOW,
      userId: USER_A,
      username: "hr@example.com",
    });
    await db.insert(mailIngestMessage).values({
      accountId: "resume_pool_mail_account",
      batchId: "resume_pool_mail_batch",
      createdAt: NOW,
      id: "resume_pool_mail_message",
      mailbox: "INBOX",
      processedAt: NOW,
      status: "queued",
      subject: "boss直聘 - 候选人简历",
      uid: "100",
      uidValidity: "1",
    });

    const result = await queryResumePoolItems({
      organizationId: ORG_A,
      scope: "private",
      userId: USER_A,
    });
    const record = result.records.find((item) => item.id === poolItemId);
    const detail = await loadResumePoolItem({
      organizationId: ORG_A,
      poolItemId,
      userId: USER_A,
    });

    expect(record?.sourceChannel).toBe("mail_ingest");
    expect(detail?.sourceChannel).toBe("mail_ingest");
  });

  it("returns referral source channel with referrer metadata", async () => {
    const id = await createResumePoolItem(
      basePoolInput({
        contentHash: "hash-resume-pool-referral",
        resumeFileName: "candidate-referral.pdf",
        scope: "public",
        sourceChannel: "referral",
      }),
    );

    const result = await queryResumePoolItems({
      organizationId: ORG_A,
      scope: "public",
      userId: USER_A,
    });
    const record = result.records.find((item) => item.id === id);
    const detail = await loadResumePoolItem({
      organizationId: ORG_A,
      poolItemId: id,
      userId: USER_A,
    });

    expect(record?.sourceChannel).toBe("referral");
    expect(record?.uploaderName).toBe("resume-pool-a");
    expect(detail?.sourceChannel).toBe("referral");
    expect(detail?.uploaderName).toBe("resume-pool-a");
  });

  it("keeps referral target role from the linked job description after parsing", async () => {
    const id = await createResumePoolItem(
      basePoolInput({
        contentHash: "hash-resume-pool-referral-target-role",
        resumeFileName: "candidate-referral-target-role.pdf",
        resumeProfile: null,
        scope: "public",
        sourceChannel: "referral",
        targetRole: "内推前端工程师",
      }),
    );

    await markResumePoolItemParsed({
      actorId: USER_A,
      organizationId: ORG_A,
      poolItemId: id,
      resumeProfile: {
        ...PROFILE,
        targetRoles: ["AI 解析出的前端开发"],
      },
      resumeText: "AI 解析出的 OCR 原文",
    });

    const detail = await loadResumePoolItem({
      organizationId: ORG_A,
      poolItemId: id,
      userId: USER_A,
    });

    expect(detail?.sourceChannel).toBe("referral");
    expect(detail?.targetRole).toBe("内推前端工程师");
    expect(detail?.resumeProfile?.targetRoles).toEqual(["AI 解析出的前端开发"]);
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
    expect(enqueueResumeSemanticIndexJobBestEffort).toHaveBeenCalledWith({
      organizationId: ORG_A,
      sourceId: publicItem.id,
      sourceType: "resume_pool_item",
    });

    const [privateItem] = await db
      .select()
      .from(resumePoolItem)
      .where(eq(resumePoolItem.id, privateId));
    expect(privateItem?.scope).toBe("private");
    expect(privateItem?.status).toBe("active");
  });
});

describe("importPoolItemToResumeLibrary", () => {
  it("imports and records semantic duplicate matches when check policy finds matches", async () => {
    const publicId = await createResumePoolItem(basePoolInput({ scope: "public" }));
    const matches: Awaited<ReturnType<typeof findSemanticResumeDuplicates>> = [
      {
        candidateEmail: "dup@example.com",
        candidateName: "重复候选人",
        candidatePhone: "13900139000",
        conflictingSignals: ["邮箱不同"],
        createdAt: "2026-06-21T09:00:00.000Z",
        id: "dup_resume_record",
        jobDescriptionName: "高级前端工程师",
        level: "high",
        score: 92,
        semanticReasons: ["工作/项目经历语义高度相似"],
        similarity: {
          resumeOverview: 0.9,
          skillRole: 0.86,
          workProject: 0.94,
        },
        status: "draft",
        targetRole: "前端工程师",
      },
    ];
    vi.mocked(findSemanticResumeDuplicates).mockResolvedValueOnce(matches);

    const result = await importPoolItemToResumeLibrary({
      dedupPolicy: "check",
      importedBy: USER_B,
      jobDescriptionId: null,
      organizationId: ORG_B,
      poolItemId: publicId,
    });

    expect(result.status).toBe("imported");
    if (result.status !== "imported") {
      throw new Error("expected import success");
    }
    const [matchRow] = await db
      .select()
      .from(resumeDuplicateMatch)
      .where(eq(resumeDuplicateMatch.sourceId, result.resumeRecordId));
    expect(matchRow).toMatchObject({
      level: "high",
      matchedSourceId: "dup_resume_record",
      organizationId: ORG_B,
      sourceType: "studio_interview",
      status: "active",
    });
  });

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
    expect(record?.resumeText).toBe("候选人甲 OCR 原文");

    const imports = await db
      .select()
      .from(resumePoolImport)
      .where(eq(resumePoolImport.importedResumeRecordId, result.resumeRecordId));
    expect(imports).toHaveLength(1);
    expect(imports[0]?.organizationId).toBe(ORG_B);
    expect(cloneResumeSemanticIndexFromPoolToInterview).toHaveBeenCalledWith({
      poolItemId: publicId,
      resumeRecordId: result.resumeRecordId,
      sourceOrganizationId: ORG_A,
      targetOrganizationId: ORG_B,
    });
    expect(enqueueResumeSemanticIndexJobBestEffort).not.toHaveBeenCalled();
  });

  it("fails the import and removes the created resume record when vector cloning fails", async () => {
    const publicId = await createResumePoolItem(
      basePoolInput({
        contentHash: "hash-resume-pool-clone-failure",
        resumeFileName: "candidate-clone-failure.pdf",
        scope: "public",
      }),
    );
    vi.mocked(cloneResumeSemanticIndexFromPoolToInterview).mockRejectedValueOnce(
      new Error("clone failed"),
    );

    await expect(
      importPoolItemToResumeLibrary({
        dedupPolicy: "force",
        importedBy: USER_B,
        jobDescriptionId: null,
        organizationId: ORG_B,
        poolItemId: publicId,
      }),
    ).rejects.toThrow("clone failed");

    const records = await db
      .select()
      .from(studioInterview)
      .where(eq(studioInterview.resumeSourcePoolItemId, publicId));
    const imports = await db
      .select()
      .from(resumePoolImport)
      .where(eq(resumePoolImport.poolItemId, publicId));
    expect(records).toHaveLength(0);
    expect(imports).toHaveLength(0);
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

describe("deleteOwnPoolItem", () => {
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
    await db.insert(resumeDuplicateMatch).values([
      {
        embeddingVersion: "test-v1",
        id: "resume_pool_delete_duplicate_source",
        level: "medium",
        matchedSourceId: imported.resumeRecordId,
        matchedSourceType: "studio_interview",
        organizationId: ORG_A,
        reasons: ["人才库记录匹配招聘台记录"],
        score: 88,
        sourceId: privateId,
        sourceType: "resume_pool_item",
        status: "active",
      },
      {
        embeddingVersion: "test-v1",
        id: "resume_pool_delete_duplicate_target",
        level: "high",
        matchedSourceId: privateId,
        matchedSourceType: "resume_pool_item",
        organizationId: ORG_A,
        reasons: ["招聘台记录匹配人才库记录"],
        score: 93,
        sourceId: imported.resumeRecordId,
        sourceType: "studio_interview",
        status: "active",
      },
    ]);

    await deleteOwnPoolItem({
      organizationId: ORG_A,
      poolItemId: privateId,
      userId: USER_A,
    });

    const poolRows = await db.select().from(resumePoolItem).where(eq(resumePoolItem.id, privateId));
    expect(poolRows).toHaveLength(0);
    expect(deleteResumeSemanticIndexBestEffort).toHaveBeenCalledWith({
      sourceId: privateId,
      sourceType: "resume_pool_item",
    });
    const duplicateRows = await db
      .select()
      .from(resumeDuplicateMatch)
      .where(
        and(
          eq(resumeDuplicateMatch.organizationId, ORG_A),
          or(
            eq(resumeDuplicateMatch.sourceId, privateId),
            eq(resumeDuplicateMatch.matchedSourceId, privateId),
          ),
        ),
      );
    expect(duplicateRows).toHaveLength(0);

    const [record] = await db
      .select()
      .from(studioInterview)
      .where(eq(studioInterview.id, imported.resumeRecordId));
    expect(record?.candidateName).toBe(PROFILE.name);
    expect(record?.resumeSourceType).toBe("private_pool");
    expect(record?.resumeSourcePoolItemId).toBeNull();
  });

  it("deletes public items created by the current user", async () => {
    const publicId = await createResumePoolItem(basePoolInput({ scope: "public" }));

    await deleteOwnPoolItem({
      organizationId: ORG_A,
      poolItemId: publicId,
      userId: USER_A,
    });

    const poolRows = await db.select().from(resumePoolItem).where(eq(resumePoolItem.id, publicId));
    expect(poolRows).toHaveLength(0);
  });

  it("rejects deleting another user's items", async () => {
    const otherPublicId = await createResumePoolItem(
      basePoolInput({ createdBy: USER_B, organizationId: ORG_A, scope: "public" }),
    );
    const otherPrivateId = await createResumePoolItem(
      basePoolInput({ createdBy: USER_B, organizationId: ORG_A }),
    );

    await expect(
      deleteOwnPoolItem({
        organizationId: ORG_A,
        poolItemId: otherPublicId,
        userId: USER_A,
      }),
    ).rejects.toThrow("简历不存在或无权删除");
    await expect(
      deleteOwnPoolItem({
        organizationId: ORG_A,
        poolItemId: otherPrivateId,
        userId: USER_A,
      }),
    ).rejects.toThrow("简历不存在或无权删除");
  });
});
