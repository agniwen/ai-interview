import { z } from "zod";
import {
  createSmallSavedMeetingSchema,
  createMultipartSavedMeetingSchema,
} from "@app/shared/meeting-recording";
import { db } from "../../../../../lib/server/db";
import {
  completeSmallSavedMeeting,
  createSmallSavedMeeting,
  createMultipartSavedMeeting,
} from "../../service";
import { assertEchoDeviceOwnership } from "./ownership-dao";
import type { EchoProcessingActor } from "./ownership-dao";
import { EchoProcessingError } from "./error";

export const echoSourcePlanSchema = z.discriminatedUnion("mode", [
  z.object({
    epoch: z.number().int().positive(),
    mode: z.literal("small"),
    recording: createSmallSavedMeetingSchema,
  }),
  z.object({
    epoch: z.number().int().positive(),
    mode: z.literal("multipart"),
    recording: createMultipartSavedMeetingSchema,
  }),
]);

export async function planEchoSources(
  input: EchoProcessingActor & z.infer<typeof echoSourcePlanSchema>,
) {
  const meeting = await assertEchoDeviceOwnership(db, input);
  if (
    input.recording.id !== meeting.id ||
    input.recording.manifestSha256 !== meeting.manifestSha256
  ) {
    throw new EchoProcessingError(409, "源录音清单不一致");
  }
  const owned = {
    input: input.recording,
    organizationId: input.organizationId,
    ownerId: meeting.ownerId,
  };
  const result =
    input.mode === "small"
      ? await createSmallSavedMeeting(owned)
      : await createMultipartSavedMeeting({ ...owned, input: input.recording });
  if ("conflict" in result) {
    throw new EchoProcessingError(409, result.message);
  }
  return result;
}

export async function completeEchoSources(input: EchoProcessingActor & { manifestSha256: string }) {
  const meeting = await assertEchoDeviceOwnership(db, input);
  const result = await completeSmallSavedMeeting({ ...input, ownerId: meeting.ownerId });
  if ("error" in result) {
    throw new EchoProcessingError(result.status, result.error);
  }
  return result;
}
