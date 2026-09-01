/**
 * One-to-one inventory of BackgroundWorkloadAdapter and its migrated source.
 * `port` is executable wiring, not documentation-only: assertConfigured checks
 * every path before BullMQ workers are allowed to start.
 */
export const BACKGROUND_WORKLOAD_IMPLEMENTATION_MANIFEST = [
  {
    adapter: "assertConfigured",
    legacy: "apps/worker/src/{config,parse-config,env}.ts",
    port: "configuration.assertConfigured",
  },
  {
    adapter: "listRecoverableMeetingAnswerJobs",
    legacy: "apps/server/src/server/routes/meetings/answers/dao.ts",
    port: "meetingAnswer.listRecoverable",
  },
  {
    adapter: "listRecoverableMeetingIntelligenceJobs",
    legacy: "apps/server/src/server/routes/meetings/intelligence/dao.ts",
    port: "meetingIntelligence.listRecoverable",
  },
  {
    adapter: "listRecoverableMeetingPlaybackJobs",
    legacy: "apps/server/src/server/routes/meetings/dao.ts",
    port: "meetingPlayback.listRecoverable",
  },
  {
    adapter: "listRecoverableMeetingPurgeJobs",
    legacy: "apps/server/src/server/routes/meetings/lifecycle-dao.ts",
    port: "meetingPurge.listRecoverable",
  },
  {
    adapter: "listRecoverableMeetingTranscriptionJobs",
    legacy: "apps/server/src/server/routes/meetings/transcription/dao.ts",
    port: "meetingTranscription.listRecoverable",
  },
  {
    adapter: "listRecoverableResumeParseJobs",
    legacy: "apps/server/src/server/routes/studio/routes/resume-upload-batches/dao/batches.ts",
    port: "resumeParse.listRecoverable",
  },
  {
    adapter: "listRecoverableResumeSemanticIndexJobs",
    legacy: "apps/server/src/lib/server/resume-semantic/indexer.ts",
    port: "resumeSemanticIndex.listRecoverable",
  },
  {
    adapter: "loadMeetingOperationsSnapshot",
    legacy: "apps/server/src/server/routes/meetings/operations-dao.ts",
    port: "meetingOperations.loadSnapshot",
  },
  {
    adapter: "pingDependencies",
    legacy: "apps/worker/src/db.ts",
    port: "dependencies.ping",
  },
  {
    adapter: "prepareMeetingTranscription",
    legacy: "apps/worker/src/meeting-transcription/processor.ts",
    port: "meetingTranscription.prepare",
  },
  {
    adapter: "processInterviewNotificationBatch",
    legacy: "apps/worker/src/interview-notifications/processor.ts",
    port: "interviewNotifications.processBatch",
  },
  {
    adapter: "processMeetingAnswer",
    legacy: "apps/worker/src/meeting-answer/processor.ts",
    port: "meetingAnswer.process",
  },
  {
    adapter: "processMeetingIntelligence",
    legacy: "apps/worker/src/meeting-intelligence/processor.ts",
    port: "meetingIntelligence.process",
  },
  {
    adapter: "processMeetingPlayback",
    legacy: "apps/worker/src/meeting-playback/processor.ts",
    port: "meetingPlayback.process",
  },
  {
    adapter: "processMeetingPurge",
    legacy: "apps/worker/src/meeting-purge/processor.ts",
    port: "meetingPurge.process",
  },
  {
    adapter: "processMeetingTranscription",
    legacy: "apps/worker/src/meeting-transcription/processor.ts",
    port: "meetingTranscription.process",
  },
  {
    adapter: "processResumeParse",
    legacy: "apps/server/src/server/agents/mastra/workflows/bulk-resume-upload-workflow.ts",
    port: "resumeParse.process",
  },
  {
    adapter: "processResumeReviewGeneration",
    legacy: "apps/server/src/server/routes/studio/routes/resumes/utils/review-worker.ts",
    port: "resumeReviewGeneration.process",
  },
  {
    adapter: "processResumeSemanticIndex",
    legacy: "apps/server/src/lib/server/{jd-semantic/indexer,resume-semantic/enrichment}.ts",
    port: "resumeSemanticIndex.process",
  },
  {
    adapter: "recoverMissingMeetingIntelligence",
    legacy: "apps/server/src/server/routes/meetings/intelligence/{dao,service}.ts",
    port: "meetingIntelligence.recoverMissing",
  },
  {
    adapter: "reportJobFailure",
    legacy: "apps/worker/src/sentry.ts",
    port: "observability.reportJobFailure",
  },
  {
    adapter: "runMailIngest",
    legacy: "apps/worker/src/mail-ingest/processor.ts",
    port: "mailIngest.run",
  },
] as const;

export type BackgroundWorkloadAdapterMethod =
  (typeof BACKGROUND_WORKLOAD_IMPLEMENTATION_MANIFEST)[number]["adapter"];

export const BACKGROUND_WORKLOAD_REQUIRED_PORTS = BACKGROUND_WORKLOAD_IMPLEMENTATION_MANIFEST.map(
  (entry) => entry.port,
);

/** Methods whose business state machine now executes from its owner-local domain workload. */
export const COPIED_BACKGROUND_WORKLOAD_METHODS = [
  "prepareMeetingTranscription",
  "processInterviewNotificationBatch",
  "processMeetingAnswer",
  "processMeetingIntelligence",
  "processMeetingPlayback",
  "processMeetingPurge",
  "processMeetingTranscription",
  "processResumeParse",
  "processResumeSemanticIndex",
  "runMailIngest",
] as const satisfies readonly BackgroundWorkloadAdapterMethod[];

/**
 * Methods that are intentionally infrastructure/application ports: DB recovery
 * queries, diagnostics, review generation, configuration and observability.
 */
export const PORT_BACKED_BACKGROUND_WORKLOAD_METHODS = [
  "assertConfigured",
  "listRecoverableMeetingAnswerJobs",
  "listRecoverableMeetingIntelligenceJobs",
  "listRecoverableMeetingPlaybackJobs",
  "listRecoverableMeetingPurgeJobs",
  "listRecoverableMeetingTranscriptionJobs",
  "listRecoverableResumeParseJobs",
  "listRecoverableResumeSemanticIndexJobs",
  "loadMeetingOperationsSnapshot",
  "pingDependencies",
  "processResumeReviewGeneration",
  "recoverMissingMeetingIntelligence",
  "reportJobFailure",
] as const satisfies readonly BackgroundWorkloadAdapterMethod[];

export const BACKGROUND_WORKLOAD_COVERAGE = {
  copiedBusinessStateMachines: COPIED_BACKGROUND_WORKLOAD_METHODS.length,
  manifestEntries: BACKGROUND_WORKLOAD_IMPLEMENTATION_MANIFEST.length,
  noOpImplementations: 0,
  portBackedInfrastructureOperations: PORT_BACKED_BACKGROUND_WORKLOAD_METHODS.length,
} as const;
