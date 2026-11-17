import { ResumeUploadRequestConflictError } from "@app/resume-processing/ingest";
import { RecruitingJobNotAcceptingCandidatesError } from "@app/recruiting/records";
import { storeResumeObjectOnly } from "../../../interview/utils";
import {
  insertBatchWithItems,
  loadBatchDetail,
} from "../../../studio/routes/resume-upload-batches/dao/batches";
import { resolveExternalApplicationActor, resolveExternalApplicationLink } from "./dao";

export async function submitExternalResume({
  file,
  jobDescriptionId,
  organizationId,
  requestId,
  token,
}: {
  file: File;
  jobDescriptionId: string | null;
  organizationId: string;
  requestId: string;
  token: string;
}) {
  const { enqueueResumeParseJobs, isResumeParseQueueConfigured } =
    await import("@app/job-queues/resume-parse");
  const userId = await resolveExternalApplicationActor(organizationId);
  if (!userId || !isResumeParseQueueConfigured()) {
    return { body: { error: "简历接收暂不可用，请稍后重试。" }, status: 503 as const };
  }
  const operationId = `external-application:${requestId}`;
  let batchId: string;
  try {
    const stored = await storeResumeObjectOnly(file, userId, organizationId, {
      requestId: operationId,
    });
    if (!stored?.storageKey) {
      return { body: { error: "文件上传失败，请重试。" }, status: 500 as const };
    }
    if (!(await resolveExternalApplicationLink(token))) {
      return { body: { error: "投递链接不可用。" }, status: 404 as const };
    }
    batchId = await insertBatchWithItems({
      dedupPolicy: "create",
      files: [
        {
          contentHash: stored.contentHash,
          fileSize: file.size,
          originalFileName: file.name,
          storageKey: stored.storageKey,
        },
      ],
      jdMode: jobDescriptionId ? "bind" : "auto",
      jobDescriptionId,
      jobMatchRequestedAt: jobDescriptionId ? null : new Date(),
      organizationId,
      requestId: operationId,
      resumePoolScope: "public",
      sourceChannel: "external_application",
      target: "resume_pool",
      userId,
    });
  } catch (error) {
    if (error instanceof RecruitingJobNotAcceptingCandidatesError) {
      return { body: { error: "岗位已暂停或停止招聘，请重新选择。" }, status: 409 as const };
    }
    if (error instanceof ResumeUploadRequestConflictError) {
      return {
        body: { error: "该文件已使用其他投递设置提交，请移除后重新选择。" },
        status: 422 as const,
      };
    }
    throw error;
  }
  const detail = await loadBatchDetail(batchId, organizationId, userId);
  if (!detail || detail.batch.status === "cancelled") {
    return { body: { error: "该投递已取消，请重新选择文件。" }, status: 422 as const };
  }
  try {
    await enqueueResumeParseJobs(
      detail.items
        .filter((item) => item.status === "pending")
        .map((item) => ({
          batchId,
          itemId: item.id,
          organizationId,
          userId,
        })),
    );
  } catch {
    return { body: { error: "简历解析队列暂不可用，请稍后重试。" }, status: 503 as const };
  }
  return { body: { status: "queued" as const }, status: 201 as const };
}
