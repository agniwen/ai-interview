import {
  buildMeetingPlaybackAssetKey,
  deleteMeetingRecordingObject,
  downloadMeetingRecordingObjectToFile,
  headMeetingRecordingObject,
  putMeetingRecordingFile,
} from "@app/server/lib/server/s3";
import {
  loadMeetingPlaybackSource,
  markMeetingPlaybackFailed,
  markMeetingPlaybackProcessing,
  publishMeetingPlaybackAsset,
  registerMeetingPlaybackCleanupKey,
  removeMeetingPlaybackCleanupKey,
} from "@app/server/server/routes/meetings/dao";
import { createDefaultMeetingPlaybackDependencies } from "./processor";

export const defaultMeetingPlaybackDependencies = createDefaultMeetingPlaybackDependencies({
  buildPlaybackStorageKey: buildMeetingPlaybackAssetKey,
  deletePlayback: deleteMeetingRecordingObject,
  downloadSource: downloadMeetingRecordingObjectToFile,
  loadSource: loadMeetingPlaybackSource,
  markFailed: markMeetingPlaybackFailed,
  markProcessing: markMeetingPlaybackProcessing,
  publishPlayback: publishMeetingPlaybackAsset,
  registerCleanupKey: registerMeetingPlaybackCleanupKey,
  removeCleanupKey: removeMeetingPlaybackCleanupKey,
  uploadPlayback: putMeetingRecordingFile,
  verifyPlayback: async (input) => {
    const object = await headMeetingRecordingObject(input.storageKey);
    return Boolean(
      object &&
      object.contentLength === input.sizeBytes &&
      object.contentType === input.contentType &&
      object.sha256 === input.sha256,
    );
  },
});
