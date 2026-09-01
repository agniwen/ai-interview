import {
  abortMeetingRecordingMultipartUpload,
  deleteMeetingRecordingObject,
  headMeetingRecordingObject,
} from "@app/object-storage";
import {
  claimMeetingPurge,
  completeMeetingPurgeStorageBatch,
  continueMeetingPurgeProviderBatch,
  finalizeMeetingPurge,
  recordMeetingProviderPurgeOutcome,
  releaseMeetingPurgeClaim,
} from "@app/server/worker/meeting-purge";
import type { MeetingProviderArtifactInput } from "@app/server/worker/meeting-purge";
import type { MeetingPurgeDependencies } from "./processor";

function deleteProviderArtifact(
  _input: MeetingProviderArtifactInput & { provider: string },
): Promise<"deleted" | "unsupported"> {
  return Promise.resolve("unsupported");
}

export const defaultMeetingPurgeDependencies: MeetingPurgeDependencies = {
  abortMultipartUpload: abortMeetingRecordingMultipartUpload,
  claim: claimMeetingPurge,
  completeStorageBatch: completeMeetingPurgeStorageBatch,
  continueProviderBatch: continueMeetingPurgeProviderBatch,
  deleteProviderArtifact,
  deleteStorageObject: deleteMeetingRecordingObject,
  finalize: finalizeMeetingPurge,
  headStorageObject: headMeetingRecordingObject,
  recordProviderOutcome: recordMeetingProviderPurgeOutcome,
  release: releaseMeetingPurgeClaim,
};
