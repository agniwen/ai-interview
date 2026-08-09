// oxlint-disable class-methods-use-this -- Adapter shape follows WorkspaceRecordingPort.
import type { WorkspaceRecordingPort } from "../../../../preload/meeting-capture";
import type {
  MultipartSavedMeetingResponse,
  SmallSavedMeetingResponse,
} from "@arc/shared/meeting-recording";
import { MEETING_SINGLE_PUT_MAX_BYTES } from "@arc/shared/meeting-recording";
import { resolveActiveWorkspace } from "@/lib/client/workspace";
import { apiUrl } from "@/lib/client/rpc";
import { apiJson } from "@/lib/client/rpc-fetch";
import { isApiError } from "@/lib/client/api-error";

function isPermanentPurgeConflict(error: unknown): boolean {
  return Boolean(
    isApiError(error) &&
    error.payload &&
    typeof error.payload === "object" &&
    "code" in error.payload &&
    error.payload.code === "meeting-purged",
  );
}

export class DesktopWorkspaceRecordingPort implements WorkspaceRecordingPort {
  async reportRecoveryCopyCleanup(
    captureId: string,
    manifestSha256: string,
    status: "deleted" | "failed",
  ): Promise<void> {
    const path = `/api/meeting-local-recovery/${encodeURIComponent(captureId)}`;
    await apiJson<null>(apiUrl(path), "回报本地恢复副本清理状态失败", {
      body: JSON.stringify({ manifestSha256, status }),
      headers: { "Content-Type": "application/json" },
      method: "PUT",
    });
  }

  async shouldDeleteRecoveryCopy(captureId: string, manifestSha256: string): Promise<boolean> {
    const path = `/api/meeting-local-recovery/${encodeURIComponent(captureId)}`;
    const result = await apiJson<{ deleteRequired: boolean }>(
      apiUrl(path),
      "检查本地恢复副本状态失败",
      {
        body: JSON.stringify({ manifestSha256 }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
    return result.deleteRequired;
  }

  async persist(
    input: Parameters<WorkspaceRecordingPort["persist"]>[0],
  ): Promise<{ recoveryCopyDeleteAfter: string }> {
    const workspace = await resolveActiveWorkspace();
    if (!workspace) {
      throw new Error("请先加入或选择一个工作区");
    }
    const descriptor = await window.api.meetingCapture.describeWorkspaceSave(input.captureId);
    if (descriptor.manifestSha256 !== input.manifestSha256) {
      throw new Error("本地录音清单在保存期间发生变化");
    }
    const meetingsUrl = apiUrl(`/api/w/${encodeURIComponent(workspace.slug)}/meetings`);
    const usesMultipart = descriptor.assets.some(
      (asset) => asset.sizeBytes > MEETING_SINGLE_PUT_MAX_BYTES,
    );
    const multipartDescriptor = usesMultipart
      ? await window.api.meetingCapture.describeMultipartWorkspaceSave(input.captureId)
      : null;
    let plan: MultipartSavedMeetingResponse | SmallSavedMeetingResponse;
    try {
      plan = usesMultipart
        ? await apiJson<MultipartSavedMeetingResponse>(
            `${meetingsUrl}/multipart`,
            "创建可恢复会议保存任务失败",
            {
              body: JSON.stringify(multipartDescriptor),
              headers: { "Content-Type": "application/json" },
              method: "POST",
            },
          )
        : await apiJson<SmallSavedMeetingResponse>(meetingsUrl, "创建会议保存任务失败", {
            body: JSON.stringify(descriptor),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          });
    } catch (error) {
      if (!isPermanentPurgeConflict(error)) {
        throw error;
      }
      await window.api.meetingCapture.discard(input.captureId);
      throw new Error("该 Meeting Session 已被永久清除，本地恢复副本也已删除", { cause: error });
    }
    if (plan.state === "workspace-verified") {
      if (!plan.recoveryCopyDeleteAfter) {
        throw new Error("服务器未返回 Local Recording Recovery Copy 清理时间");
      }
      return { recoveryCopyDeleteAfter: plan.recoveryCopyDeleteAfter };
    }
    input.report("uploading");
    const upload = usesMultipart
      ? window.api.meetingCapture.uploadMultipart(
          input.captureId,
          (plan as MultipartSavedMeetingResponse).uploads,
        )
      : window.api.meetingCapture.uploadSmall(
          input.captureId,
          (plan as SmallSavedMeetingResponse).uploads,
        );
    await upload;
    input.report("verifying");
    const completed = await apiJson<{
      meetingId: string;
      recoveryCopyDeleteAfter: string;
      state: "workspace-verified";
    }>(`${meetingsUrl}/${encodeURIComponent(input.captureId)}/complete`, "验证会议录音失败", {
      body: JSON.stringify({ manifestSha256: input.manifestSha256 }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    return { recoveryCopyDeleteAfter: completed.recoveryCopyDeleteAfter };
  }
}
