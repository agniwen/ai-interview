import { MeetingTaskDeferredError } from "./task-deferred-error";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { echoDeletionStateSchema } from "@app/shared/meeting-device-processing";
import type { LocalMeetingRecordingStore } from "../meeting-capture/local-meeting-recording-store";
import type { TaskContext } from "./scheduler";
import type { MeetingTaskStore } from "./task-store";
import { EchoServerClient } from "./server-client";

export function createEchoPurgeHandler(input: {
  tasks: MeetingTaskStore;
  client: EchoServerClient;
  recordings: LocalMeetingRecordingStore;
  artifactRoot: string;
  cancelMeeting: (meetingId: string) => Promise<void>;
}) {
  return async (context: TaskContext) => {
    await input.client.assertAccount(context.binding, context.signal);
    const path = `${EchoServerClient.meetingsPath(context.binding)}/${encodeURIComponent(context.binding.resource_meeting_id)}/device/deletion`;
    const options = {
      accountId: context.binding.account_id,
      method: "POST",
      signal: context.signal,
      workspaceId: context.binding.workspace_id,
    };
    const state = await input.client.request(path, echoDeletionStateSchema, {
      ...options,
      method: "GET",
    });
    const intent =
      state.state === "deleted" || !state.canAdvance
        ? state
        : await input.client.request(path, echoDeletionStateSchema, options);
    for (const binding of input.tasks
      .bindings()
      .filter((item) => item.resource_meeting_id === context.binding.resource_meeting_id)) {
      input.tasks.tombstone(binding.meeting_id);
      await input.cancelMeeting(binding.meeting_id);
    }
    const result =
      intent.state === "deleted" || !intent.canAdvance
        ? intent
        : await input.client.request(`${path}/step`, echoDeletionStateSchema, options);
    if (result.state !== "deleted") {
      throw new MeetingTaskDeferredError(
        Math.max(Date.now() + 30_000, Date.parse(result.nextAttemptAt)),
      );
    }
    for (const binding of input.tasks
      .bindings()
      .filter((item) => item.resource_meeting_id === context.binding.resource_meeting_id)) {
      await input.cancelMeeting(binding.meeting_id);
      input.tasks.tombstone(binding.meeting_id);
      if (binding.meeting_id === binding.resource_meeting_id) {
        await input.recordings.discard(binding.meeting_id);
      }
      await rm(join(input.artifactRoot, binding.meeting_id), { force: true, recursive: true });
      input.tasks.clearDeletedResults(binding.meeting_id);
    }
    input.tasks.completeResourcePurges(context.binding.resource_meeting_id);
    return { deleted: true };
  };
}
