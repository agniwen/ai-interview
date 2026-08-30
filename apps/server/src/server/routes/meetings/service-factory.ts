import type { MeetingServiceDependencies } from "./service-dependencies";
import { defaultMeetingServiceDependencies } from "./service-dependencies";
import {
  completeSmallSavedMeeting,
  createMeetingPlaybackAuthorization,
  createMultipartSavedMeeting,
  createSmallSavedMeeting,
  getSavedMeetingDetail,
  heartbeatSavedMeetingUpload,
  listSavedMeetings,
  renameSavedMeeting,
  retryMeetingPlayback,
} from "./service";

export function createMeetingService(
  dependencies: MeetingServiceDependencies = defaultMeetingServiceDependencies,
) {
  return {
    completeSmallSavedMeeting: (input: Parameters<typeof completeSmallSavedMeeting>[0]) =>
      completeSmallSavedMeeting(input, dependencies),
    createMeetingPlaybackAuthorization: (
      input: Parameters<typeof createMeetingPlaybackAuthorization>[0],
    ) => createMeetingPlaybackAuthorization(input, dependencies),
    createMultipartSavedMeeting: (input: Parameters<typeof createMultipartSavedMeeting>[0]) =>
      createMultipartSavedMeeting(input, dependencies),
    createSmallSavedMeeting: (input: Parameters<typeof createSmallSavedMeeting>[0]) =>
      createSmallSavedMeeting(input, dependencies),
    getSavedMeetingDetail: (input: Parameters<typeof getSavedMeetingDetail>[0]) =>
      getSavedMeetingDetail(input, dependencies),
    heartbeatSavedMeetingUpload: (input: Parameters<typeof heartbeatSavedMeetingUpload>[0]) =>
      heartbeatSavedMeetingUpload(input, dependencies),
    listSavedMeetings: (input: Parameters<typeof listSavedMeetings>[0]) =>
      listSavedMeetings(input, dependencies),
    renameSavedMeeting: (input: Parameters<typeof renameSavedMeeting>[0]) =>
      renameSavedMeeting(input, dependencies),
    retryMeetingPlayback: (input: Parameters<typeof retryMeetingPlayback>[0]) =>
      retryMeetingPlayback(input, dependencies),
  };
}
