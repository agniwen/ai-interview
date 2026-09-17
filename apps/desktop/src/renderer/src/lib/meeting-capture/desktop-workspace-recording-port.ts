import type { WorkspaceRecordingPort } from "../../../../preload/meeting-capture";
import type { EchoProcessingApi } from "../../../../preload/echo-processing-api";
import { apiUrl } from "@/lib/client/rpc";
import { apiJson } from "@/lib/client/rpc-fetch";

export interface DesktopWorkspaceRecordingPortDependencies {
  apiJson: typeof apiJson;
  apiUrl: typeof apiUrl;
  processing: Pick<EchoProcessingApi, "status">;
  wait: () => Promise<void>;
}

async function waitForStatus(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<null>();
  setTimeout(resolve, 1000, null);
  await promise;
}

/** Observes Main's durable backup; closing this window cannot cancel processing. */
export class DesktopWorkspaceRecordingPort implements WorkspaceRecordingPort {
  private readonly dependencies: DesktopWorkspaceRecordingPortDependencies;
  constructor(dependencies: Partial<DesktopWorkspaceRecordingPortDependencies> = {}) {
    this.dependencies = {
      apiJson: dependencies.apiJson ?? apiJson,
      apiUrl: dependencies.apiUrl ?? apiUrl,
      processing: dependencies.processing ?? window.api.echoProcessing,
      wait: dependencies.wait ?? (() => waitForStatus()),
    };
  }

  async persist(
    input: Parameters<WorkspaceRecordingPort["persist"]>[0],
  ): Promise<{ recoveryCopyDeleteAfter: string }> {
    input.report("uploading");
    while (true) {
      const status = await this.dependencies.processing.status(input.captureId);
      if (status.backupVerifiedAt) {
        return { recoveryCopyDeleteAfter: status.backupVerifiedAt };
      }
      if (status.state === "unbound") {
        throw new Error("请先在此设备继续处理这份历史录音");
      }
      if (status.state === "failed" || status.state === "paused") {
        throw new Error(status.error ?? "处理已暂停，请手动重试");
      }
      await this.dependencies.wait();
    }
  }

  async shouldDeleteRecoveryCopy(captureId: string, manifestSha256: string): Promise<boolean> {
    const result = await this.dependencies.apiJson<{ deleteRequired: boolean }>(
      this.dependencies.apiUrl(`/api/meeting-local-recovery/${encodeURIComponent(captureId)}`),
      "检查本地录音状态失败",
      {
        body: JSON.stringify({ manifestSha256 }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
    return result.deleteRequired;
  }

  async reportRecoveryCopyCleanup(
    captureId: string,
    manifestSha256: string,
    status: "deleted" | "failed",
  ): Promise<void> {
    await this.dependencies.apiJson<null>(
      this.dependencies.apiUrl(`/api/meeting-local-recovery/${encodeURIComponent(captureId)}`),
      "回报本地录音清理状态失败",
      {
        body: JSON.stringify({ manifestSha256, status }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      },
    );
  }
}
