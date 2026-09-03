import {
  abortMeetingRecordingMultipartUpload,
  deleteMeetingRecordingObject,
  headMeetingRecordingObject,
} from "@app/object-storage";
import type { MeetingProviderArtifactInput } from "@app/meeting-processing/purge";
import { meetingPurgeDao as purgeDao } from "../meeting-processing-daos";
import type { MeetingPurgeDependencies } from "./processor";

function deleteProviderArtifact(
  _input: MeetingProviderArtifactInput & { provider: string },
): Promise<"deleted" | "unsupported"> {
  return Promise.resolve("unsupported");
}

export const defaultMeetingPurgeDependencies: MeetingPurgeDependencies = {
  abortMultipartUpload: abortMeetingRecordingMultipartUpload,
  claim: purgeDao.claimMeetingPurge,
  completeStorageBatch: purgeDao.completeMeetingPurgeStorageBatch,
  continueProviderBatch: purgeDao.continueMeetingPurgeProviderBatch,
  deleteProviderArtifact,
  deleteStorageObject: deleteMeetingRecordingObject,
  finalize: purgeDao.finalizeMeetingPurge,
  headStorageObject: headMeetingRecordingObject,
  recordProviderOutcome: purgeDao.recordMeetingProviderPurgeOutcome,
  release: purgeDao.releaseMeetingPurgeClaim,
};
