import {
  downloadMeetingRecordingObjectToFile,
  headMeetingRecordingObject,
} from "@app/object-storage";
import { enqueueMeetingTranscriptionJobs } from "@app/job-queues/meeting-transcription";
import {
  humanInterviewRecordingDao,
  meetingTranscriptionDao as transcriptionDao,
  requestAutomaticHumanInterviewEvaluation,
} from "../meeting-processing-daos";
import type { HumanInterviewRecordingProcessorDependencies } from "./processor";

export const defaultHumanInterviewRecordingDependencies: HumanInterviewRecordingProcessorDependencies =
  {
    download: downloadMeetingRecordingObjectToFile,
    enqueueTranscription: enqueueMeetingTranscriptionJobs,
    getTranscriptionJob: transcriptionDao.getMeetingTranscriptionJobForMeeting,
    head: headMeetingRecordingObject,
    ingest: humanInterviewRecordingDao.ingestHumanInterviewRecording,
    markError: humanInterviewRecordingDao.saveHumanInterviewRecordingProcessingError,
    markTranscriptionUnavailable:
      humanInterviewRecordingDao.markHumanInterviewTranscriptionUnavailable,
    requestEvaluation: requestAutomaticHumanInterviewEvaluation,
  };
