import {
  downloadMeetingRecordingObjectToFile,
  headMeetingRecordingObject,
} from "@app/object-storage";
import {
  ingestHumanInterviewRecording,
  markHumanInterviewTranscriptionUnavailable,
  saveHumanInterviewRecordingProcessingError,
} from "@app/server/worker/human-interview";
import { getMeetingTranscriptionJobForMeeting } from "@app/server/worker/meeting-transcription";
import { enqueueMeetingTranscriptionJobs } from "@app/meeting-processing-queue/meeting-transcription";
import type { HumanInterviewRecordingProcessorDependencies } from "./processor";

export const defaultHumanInterviewRecordingDependencies: HumanInterviewRecordingProcessorDependencies =
  {
    download: downloadMeetingRecordingObjectToFile,
    enqueueTranscription: enqueueMeetingTranscriptionJobs,
    getTranscriptionJob: getMeetingTranscriptionJobForMeeting,
    head: headMeetingRecordingObject,
    ingest: ingestHumanInterviewRecording,
    markError: saveHumanInterviewRecordingProcessingError,
    markTranscriptionUnavailable: markHumanInterviewTranscriptionUnavailable,
  };
