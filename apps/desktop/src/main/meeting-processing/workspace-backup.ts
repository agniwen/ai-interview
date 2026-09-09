import { z } from "zod";
import { MEETING_SINGLE_PUT_MAX_BYTES } from "@app/shared/meeting-recording";
import type { LocalMeetingRecordingStore } from "../meeting-capture/local-meeting-recording-store";
import { EchoServerClient } from "./server-client";
import type { TaskContext } from "./scheduler";
import type { MeetingTaskStore } from "./task-store";
import { localAdoption } from "./adoption";
import { MeetingTaskError } from "./task-error";

const uploadBaseSchema = z.object({
  expiresAt: z.string(),
  headers: z.record(z.string(), z.string()),
  method: z.literal("PUT"),
  sizeBytes: z.number().int().nonnegative(),
  track: z.enum(["microphone", "system"]),
  url: z.url(),
});
const planBaseSchema = z.object({
  meetingId: z.string(),
  recoveryCopyDeleteAfter: z.string().nullable(),
  state: z.enum(["uploading", "workspace-verified"]),
});
const smallPlanSchema = planBaseSchema.extend({
  uploads: uploadBaseSchema.extend({ contentType: z.string() }).array(),
});
const multipartPlanSchema = planBaseSchema.extend({
  uploads: uploadBaseSchema
    .extend({
      offsetBytes: z.number().int().nonnegative(),
      partNumber: z.number().int().positive(),
    })
    .array(),
});
const completeSchema = z.object({
  meetingId: z.string(),
  recoveryCopyDeleteAfter: z.string(),
  state: z.literal("workspace-verified"),
});

export function createWorkspaceBackupHandlers(
  store: Pick<
    LocalMeetingRecordingStore,
    | "describeWorkspaceSave"
    | "describeMultipartWorkspaceSave"
    | "uploadSmall"
    | "uploadMultipart"
    | "markWorkspaceVerified"
  >,
  client: EchoServerClient,
  tasks?: MeetingTaskStore,
) {
  async function plan(context: TaskContext) {
    await client.assertAccount(context.binding, context.signal);
    const descriptor = await store.describeWorkspaceSave(context.task.meeting_id);
    if (descriptor.manifestSha256 !== context.task.input_revision) {
      throw new MeetingTaskError("invalid", "本地录音清单与任务版本不一致");
    }
    const path = EchoServerClient.meetingsPath(context.binding);
    const adopted = tasks ? localAdoption(tasks, context.task.meeting_id) : null;
    const ownership = {
      accountId: context.binding.account_id,
      deviceId: client.deviceId,
      workspaceId: context.binding.workspace_id,
    };
    if (descriptor.assets.some((asset) => asset.sizeBytes > MEETING_SINGLE_PUT_MAX_BYTES)) {
      const multipart = await store.describeMultipartWorkspaceSave(context.task.meeting_id);
      return {
        mode: "multipart" as const,
        plan: await client.request(
          adopted
            ? `${path}/${encodeURIComponent(context.task.meeting_id)}/device/sources`
            : `${path}/multipart`,
          multipartPlanSchema,
          {
            accountId: context.binding.account_id,
            body: JSON.stringify(
              adopted
                ? { epoch: adopted.context.epoch, mode: "multipart", recording: multipart }
                : { ...multipart, processingOwnership: ownership },
            ),
            method: "POST",
            signal: context.signal,
            workspaceId: context.binding.workspace_id,
          },
        ),
      };
    }
    return {
      mode: "small" as const,
      plan: await client.request(
        adopted ? `${path}/${encodeURIComponent(context.task.meeting_id)}/device/sources` : path,
        smallPlanSchema,
        {
          accountId: context.binding.account_id,
          body: JSON.stringify(
            adopted
              ? { epoch: adopted.context.epoch, mode: "small", recording: descriptor }
              : { ...descriptor, processingOwnership: ownership },
          ),
          method: "POST",
          signal: context.signal,
          workspaceId: context.binding.workspace_id,
        },
      ),
    };
  }

  return {
    backup: async (context: TaskContext) => {
      // Refresh signed URLs on each attempt; the immutable manifest makes repeat uploads safe.
      const planned = await plan(context);
      if (planned.plan.state === "workspace-verified" && planned.plan.recoveryCopyDeleteAfter) {
        await store.markWorkspaceVerified(
          context.task.meeting_id,
          planned.plan.recoveryCopyDeleteAfter,
        );
        return { recoveryCopyDeleteAfter: planned.plan.recoveryCopyDeleteAfter };
      }
      const renewLease = async () => {
        try {
          await client.request(
            `${EchoServerClient.meetingsPath(context.binding)}/${encodeURIComponent(context.task.meeting_id)}/upload-heartbeat`,
            z.null(),
            {
              accountId: context.binding.account_id,
              method: "POST",
              signal: context.signal,
              workspaceId: context.binding.workspace_id,
            },
          );
        } catch {
          // The next verification remains authoritative.
        }
      };
      const heartbeat = setInterval(
        () => {
          void renewLease();
        },
        30 * 60 * 1000,
      );
      heartbeat.unref();
      try {
        const options = { maxAttempts: 1, signal: context.signal };
        await (planned.mode === "multipart"
          ? store.uploadMultipart(context.task.meeting_id, planned.plan.uploads, options)
          : store.uploadSmall(context.task.meeting_id, planned.plan.uploads, options));
      } finally {
        clearInterval(heartbeat);
      }
      const adopted = tasks ? localAdoption(tasks, context.task.meeting_id) : null;
      const completed = await client.request(
        `${EchoServerClient.meetingsPath(context.binding)}/${encodeURIComponent(context.task.meeting_id)}/${adopted ? "device/sources/complete" : "complete"}`,
        completeSchema,
        {
          accountId: context.binding.account_id,
          body: JSON.stringify({
            epoch: adopted?.context.epoch,
            manifestSha256: context.task.input_revision,
          }),
          method: "POST",
          signal: context.signal,
          workspaceId: context.binding.workspace_id,
        },
      );
      await store.markWorkspaceVerified(context.task.meeting_id, completed.recoveryCopyDeleteAfter);
      return { recoveryCopyDeleteAfter: completed.recoveryCopyDeleteAfter };
    },
    register: async (context: TaskContext) => {
      const registered = await plan(context);
      return { meetingId: registered.plan.meetingId };
    },
  };
}
