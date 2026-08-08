// oxlint-disable class-methods-use-this -- Adapter shape follows WorkspaceRecordingPort.
import type { WorkspaceRecordingPort } from "../../../../preload/meeting-capture";
import type { SmallSavedMeetingResponse } from "@arc/shared/meeting-recording";
import { resolveActiveWorkspace } from "@/lib/client/workspace";
import { apiUrl } from "@/lib/client/rpc";
import { apiJson } from "@/lib/client/rpc-fetch";

export class DesktopWorkspaceRecordingPort implements WorkspaceRecordingPort {
  async persist(input: Parameters<WorkspaceRecordingPort["persist"]>[0]): Promise<void> {
    const workspace = await resolveActiveWorkspace();
    if (!workspace) {
      throw new Error("请先加入或选择一个工作区");
    }
    const descriptor = await window.api.meetingCapture.describeWorkspaceSave(input.captureId);
    if (descriptor.manifestSha256 !== input.manifestSha256) {
      throw new Error("本地录音清单在保存期间发生变化");
    }
    const meetingsUrl = apiUrl(`/api/w/${encodeURIComponent(workspace.slug)}/meetings`);
    const plan = await apiJson<SmallSavedMeetingResponse>(meetingsUrl, "创建会议保存任务失败", {
      body: JSON.stringify(descriptor),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (plan.state === "workspace-verified") {
      return;
    }
    input.report("uploading");
    await window.api.meetingCapture.uploadSmall(input.captureId, plan.uploads);
    input.report("verifying");
    await apiJson<{ meetingId: string; state: "workspace-verified" }>(
      `${meetingsUrl}/${encodeURIComponent(input.captureId)}/complete`,
      "验证会议录音失败",
      {
        body: JSON.stringify({ manifestSha256: input.manifestSha256 }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
  }
}
