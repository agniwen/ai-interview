// oxlint-disable class-methods-use-this -- Adapter shape follows WorkspaceRecordingPort.
import type { WorkspaceRecordingPort } from "../../../../preload/meeting-capture";
import type { MeetingCaptureApi } from "../../../../preload/meeting-capture-api";
import type {
  CreateMultipartSavedMeetingInput,
  CreateSmallSavedMeetingInput,
  MultipartSavedMeetingResponse,
  SmallSavedMeetingResponse,
} from "@arc/shared/meeting-recording";
import { MEETING_SINGLE_PUT_MAX_BYTES } from "@arc/shared/meeting-recording";
import { resolveActiveWorkspace } from "@/lib/client/workspace";
import { apiUrl } from "@/lib/client/rpc";
import { apiJson } from "@/lib/client/rpc-fetch";
import type { ApiError } from "@/lib/client/api-error";
import { isApiError } from "@/lib/client/api-error";
import { z } from "zod";

const UPLOAD_HEARTBEAT_INTERVAL_MS = 30 * 60 * 1000;

const permanentPurgeConflictSchema = z.object({ code: z.literal("meeting-purged") });

function isPermanentPurgeConflict(error: ApiError): boolean {
  return permanentPurgeConflictSchema.safeParse(error.payload).success;
}

function serializeWorkspaceSaveDescriptor(
  descriptor: CreateMultipartSavedMeetingInput | CreateSmallSavedMeetingInput,
): string {
  const draft = descriptor.liveTranscriptDraft;
  if (!draft) {
    return JSON.stringify(descriptor);
  }
  return JSON.stringify({
    ...descriptor,
    liveTranscriptDraft: {
      ...draft,
      turns: draft.turns.map((turn) => ({
        correctionModel: turn.correctionModel,
        final: turn.final,
        id: turn.id,
        originalText: turn.originalText,
        sectionId: turn.sectionId,
        text: turn.text,
        track: turn.track,
      })),
    },
  });
}

/**
 * 将已冻结的本地录音提交到 Workspace：Renderer 只编排 API，音频字节始终由 Main 进程流式上传。
 * Commits a frozen local capture to the workspace: renderer orchestrates APIs while main streams the audio bytes.
 */
export class DesktopWorkspaceRecordingPort implements WorkspaceRecordingPort {
  private readonly dependencies: DesktopWorkspaceRecordingPortDependencies;

  constructor(dependencies: Partial<DesktopWorkspaceRecordingPortDependencies> = {}) {
    this.dependencies = {
      apiJson: dependencies.apiJson ?? apiJson,
      apiUrl: dependencies.apiUrl ?? apiUrl,
      meetingCapture: dependencies.meetingCapture ?? window.api.meetingCapture,
      resolveActiveWorkspace: dependencies.resolveActiveWorkspace ?? resolveActiveWorkspace,
    };
  }

  async reportRecoveryCopyCleanup(
    captureId: string,
    manifestSha256: string,
    status: "deleted" | "failed",
  ): Promise<void> {
    const path = `/api/meeting-local-recovery/${encodeURIComponent(captureId)}`;
    await this.dependencies.apiJson<null>(
      this.dependencies.apiUrl(path),
      "回报本地恢复副本清理状态失败",
      {
        body: JSON.stringify({ manifestSha256, status }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      },
    );
  }

  async shouldDeleteRecoveryCopy(captureId: string, manifestSha256: string): Promise<boolean> {
    const path = `/api/meeting-local-recovery/${encodeURIComponent(captureId)}`;
    const result = await this.dependencies.apiJson<{ deleteRequired: boolean }>(
      this.dependencies.apiUrl(path),
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
    // 协议顺序是 plan -> heartbeat + upload -> server verification；只有最后一步才可标记 workspace-verified。
    // Protocol order is plan -> heartbeat + upload -> server verification; only the final step marks workspace-verified.
    const workspace = await this.dependencies.resolveActiveWorkspace();
    if (!workspace) {
      throw new Error("请先加入或选择一个工作区");
    }
    const descriptor = await this.dependencies.meetingCapture.describeWorkspaceSave(
      input.captureId,
    );
    if (descriptor.manifestSha256 !== input.manifestSha256) {
      throw new Error("本地录音清单在保存期间发生变化");
    }
    const meetingsUrl = this.dependencies.apiUrl(
      `/api/w/${encodeURIComponent(workspace.slug)}/meetings`,
    );
    const usesMultipart = descriptor.assets.some(
      (asset) => asset.sizeBytes > MEETING_SINGLE_PUT_MAX_BYTES,
    );
    const multipartDescriptor = usesMultipart
      ? await this.dependencies.meetingCapture.describeMultipartWorkspaceSave(input.captureId)
      : null;
    let multipartPlan: MultipartSavedMeetingResponse | null = null;
    let smallPlan: SmallSavedMeetingResponse | null = null;
    try {
      if (usesMultipart) {
        if (!multipartDescriptor) {
          throw new Error("本地录音分片清单缺失");
        }
        multipartPlan = await this.dependencies.apiJson<MultipartSavedMeetingResponse>(
          `${meetingsUrl}/multipart`,
          "创建可恢复会议保存任务失败",
          {
            body: serializeWorkspaceSaveDescriptor(multipartDescriptor),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          },
        );
      } else {
        smallPlan = await this.dependencies.apiJson<SmallSavedMeetingResponse>(
          meetingsUrl,
          "创建会议保存任务失败",
          {
            body: serializeWorkspaceSaveDescriptor(descriptor),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          },
        );
      }
    } catch (error) {
      if (!isApiError(error) || !isPermanentPurgeConflict(error)) {
        throw error;
      }
      await this.dependencies.meetingCapture.discard(input.captureId);
      throw new Error("该 Meeting Session 已被永久清除，本地恢复副本也已删除", { cause: error });
    }
    const plan = multipartPlan ?? smallPlan;
    if (!plan) {
      throw new Error("服务器未返回会议保存任务");
    }
    if (plan.state === "workspace-verified") {
      if (!plan.recoveryCopyDeleteAfter) {
        throw new Error("服务器未返回 Local Recording Recovery Copy 清理时间");
      }
      return { recoveryCopyDeleteAfter: plan.recoveryCopyDeleteAfter };
    }
    input.report("uploading");
    const heartbeatUrl = `${meetingsUrl}/${encodeURIComponent(input.captureId)}/upload-heartbeat`;
    let heartbeatRunning = false;
    const heartbeat = async (): Promise<void> => {
      if (heartbeatRunning) {
        return;
      }
      heartbeatRunning = true;
      try {
        await this.dependencies.apiJson<null>(heartbeatUrl, "续期录音上传租约失败", {
          method: "POST",
        });
      } catch (error) {
        console.warn("[meeting-capture] direct-upload heartbeat failed", {
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
      } finally {
        heartbeatRunning = false;
      }
    };
    const heartbeatTimer = setInterval(() => {
      heartbeat();
    }, UPLOAD_HEARTBEAT_INTERVAL_MS);
    let upload: Promise<void>;
    if (multipartPlan) {
      upload = this.dependencies.meetingCapture.uploadMultipart(
        input.captureId,
        multipartPlan.uploads,
      );
    } else if (smallPlan) {
      upload = this.dependencies.meetingCapture.uploadSmall(input.captureId, smallPlan.uploads);
    } else {
      throw new Error("服务器未返回上传任务");
    }
    try {
      await upload;
    } finally {
      clearInterval(heartbeatTimer);
    }
    input.report("verifying");
    const completed = await this.dependencies.apiJson<{
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

export interface DesktopWorkspaceRecordingPortDependencies {
  apiJson: typeof apiJson;
  apiUrl: typeof apiUrl;
  meetingCapture: Pick<
    MeetingCaptureApi,
    | "describeMultipartWorkspaceSave"
    | "describeWorkspaceSave"
    | "discard"
    | "uploadMultipart"
    | "uploadSmall"
  >;
  resolveActiveWorkspace: typeof resolveActiveWorkspace;
}
