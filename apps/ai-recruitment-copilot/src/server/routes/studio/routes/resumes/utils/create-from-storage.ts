import "server-only";

import { db } from "@/lib/server/db";
import { studioInterview } from "@arc/db-schema/schema";
import type { InterviewQuestion, ResumeProfile } from "@arc/db-schema/interview/types";
import { syncResumeSkills } from "../dao/skills";

export interface CreateResumeRecordFromStorageInput {
  candidateEmail: string | null;
  candidateName: string | null;
  candidatePhone: string | null;
  contentHash: string | null;
  interviewQuestions?: InterviewQuestion[];
  jobDescriptionId: string | null;
  notes: string | null;
  organizationId: string;
  resumeFileName: string | null;
  resumeProfile: ResumeProfile | null;
  storageKey: string | null;
  targetRole: string | null;
  userId: string | null;
}

// 仅"从已经上传好的简历文件 + 已经解析过的 profile"装配一行 studio_interview。
// 不做：dedup / JD 匹配 / 上传 / 解析——由调用方负责。
//
// Assemble a single studio_interview row from an already-uploaded resume +
// already-parsed profile. Does NOT do dedup / JD-matching / upload / parsing —
// the caller is responsible for those.
export async function createResumeRecordFromStorage(
  input: CreateResumeRecordFromStorageInput,
): Promise<string> {
  const now = new Date();
  const recordId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(studioInterview).values({
      candidateEmail: input.candidateEmail,
      candidateName: input.candidateName?.trim() || input.resumeProfile?.name || "未命名候选人",
      candidatePhone: input.candidatePhone ?? input.resumeProfile?.phone ?? null,
      createdAt: now,
      createdBy: input.userId,
      id: recordId,
      interviewQuestions: input.interviewQuestions ?? [],
      jobDescriptionId: input.jobDescriptionId,
      notes: input.notes,
      organizationId: input.organizationId,
      resumeContentHash: input.contentHash,
      resumeFileName: input.resumeFileName,
      resumeProfile: input.resumeProfile,
      resumeStorageKey: input.storageKey,
      status: "draft" as const,
      targetRole: input.targetRole?.trim() || input.resumeProfile?.targetRoles?.[0] || null,
      updatedAt: now,
    });
    await syncResumeSkills(tx, {
      interviewId: recordId,
      organizationId: input.organizationId,
      skills: input.resumeProfile?.skills,
    });
  });
  return recordId;
}
