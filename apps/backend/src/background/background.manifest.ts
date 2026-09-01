/** Executable inventory of the legacy worker surface migrated into BackgroundModule. */
export const BACKGROUND_WORKLOAD_MANIFEST = {
  consumers: [
    { featureFlag: null, name: "resume-parse", recovery: "startup" },
    {
      featureFlag: "RESUME_SEMANTIC_INDEX_ENABLED",
      name: "resume-semantic-index",
      recovery: "startup",
    },
    { featureFlag: null, name: "resume-review-generation", recovery: null },
    {
      featureFlag: "MAIL_INGEST_ENABLED",
      name: "mail-ingest-trigger",
      recovery: null,
    },
    { featureFlag: null, name: "meeting-answer", recovery: "startup-and-interval" },
    { featureFlag: null, name: "meeting-playback", recovery: "startup-and-interval" },
    { featureFlag: null, name: "meeting-purge", recovery: "startup-and-interval" },
    {
      featureFlag: null,
      name: "meeting-intelligence",
      recovery: "startup-and-interval-with-missing-run-repair",
    },
    {
      featureFlag: "provider-availability",
      name: "meeting-transcription",
      recovery: "startup-and-interval",
    },
  ],
  diagnostics: [
    "queues/resume-parse/stats",
    "queues/resume-review-generation/stats",
    "operations/meetings",
    "operations/interview-notifications",
  ],
  lifecycle: [
    "manual-bullmq-registration",
    "startup-recovery-before-consumption",
    "stop-schedulers-before-consumers",
    "wait-for-active-schedulers-and-jobs",
    "close-all-nine-nest-queues",
  ],
  schedulers: [
    {
      cadence: "MAIL_INGEST_INTERVAL_MS",
      featureFlags: ["MAIL_INGEST_ENABLED"],
      name: "mail-ingest",
    },
    {
      cadence: "INTERVIEW_NOTIFICATION_POLL_INTERVAL_MS",
      featureFlags: [
        "INTERVIEW_NOTIFICATION_FLOW_ENABLED",
        "INTERVIEW_NOTIFICATION_WORKER_ENABLED",
      ],
      name: "interview-notifications",
    },
    {
      cadence: "BACKGROUND_RECOVERY_INTERVAL_MS",
      featureFlags: [],
      name: "meeting-recovery",
    },
  ],
} as const;
