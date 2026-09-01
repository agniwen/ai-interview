/* oxlint-disable eslint/complexity, eslint/sort-keys, anti-slop/require-safety-comment-for-type-assertion -- The temporary source classifier spells out each migration-era location; domain owners follow dependency/lifecycle order and Object.fromEntries preserves the exhaustively constrained DataOwner keys. */

export const DATA_OWNERS = [
  "identity-access",
  "recruiting-setup",
  "jobs",
  "candidate-lifecycle",
  "meetings",
  "recruiting-copilot",
] as const;

export type DataOwner = (typeof DATA_OWNERS)[number];

const tablesByOwner = {
  "identity-access": [
    "user",
    "session",
    "account",
    "verification",
    "organization",
    "member",
    "organizationRole",
    "recruitingGroup",
    "recruitingGroupMember",
    "workspaceInviteLink",
    "invitation",
  ],
  "recruiting-setup": [
    "department",
    "interviewer",
    "minimaxVoicePreview",
    "globalConfig",
    "candidateFormTemplate",
    "candidateFormTemplateJobDescription",
    "candidateFormTemplateQuestion",
    "candidateFormTemplateVersion",
    "interviewQuestionTemplate",
    "interviewQuestionTemplateJobDescription",
    "interviewQuestionTemplateQuestion",
    "interviewQuestionTemplateVersion",
  ],
  jobs: [
    "jobDescription",
    "jobDescriptionVersion",
    "jobDescriptionEvaluationUpgradeDraft",
    "jobDescriptionEvaluationUpgradeAudit",
    "jobDescriptionInterviewer",
    "referralLink",
  ],
  "candidate-lifecycle": [
    "studioOrgSkill",
    "resumeEvaluationVersion",
    "resumeEvaluationFailure",
    "resumeSemanticIndex",
    "resumeDuplicateMatch",
    "resumeJobMatchRun",
    "resumeJobMatchCandidate",
    "resumePoolItem",
    "resumePoolImport",
    "resumePoolEvent",
    "resumeUploadBatch",
    "resumeUploadBatchItem",
    "mailIngestAccount",
    "mailIngestMessage",
    "chatAttachment",
    "studioInterview",
    "studioOfferDraft",
    "interviewAuditLog",
    "studioInterviewSchedule",
    "studioHumanInterviewRound",
    "studioHumanInterviewMeeting",
    "studioHumanInterviewMeetingEvent",
    "studioHumanInterviewMeetingRound",
    "studioHumanInterviewMeetingInterviewer",
    "studioHumanInterviewRoundInterviewer",
    "interviewConversation",
    "interviewConversationTurn",
    "candidateFormSubmission",
    "interviewQuestionTemplateBinding",
    "interviewContextSnapshot",
    "interviewEvidenceSnapshot",
    "studioRoundEmailLog",
    "studioInterviewNotificationRecipient",
    "interviewNotificationTemplate",
    "interviewNotificationTemplateVersion",
    "interviewNotificationEvent",
    "interviewNotification",
  ],
  meetings: [
    "meetingSession",
    "meetingLiveTranscriptLease",
    "meetingPurgeTombstone",
    "meetingStorageCleanupKey",
    "meetingRecruitingContext",
    "meetingTranscriptionPolicy",
    "meetingProcessingRun",
    "meetingTranscriptRevision",
    "meetingTranscriptTurn",
    "meetingIntelligenceRevision",
    "meetingQuestionThread",
    "meetingQuestionExchange",
    "meetingTranscriptionChunk",
    "meetingRecordingAsset",
    "meetingAccessGrant",
    "meetingNote",
    "meetingSearchProjection",
    "meetingAuditLog",
  ],
  "recruiting-copilot": [
    "chatStateSubscriptions",
    "chatStateLocks",
    "chatStateCache",
    "chatStateLists",
    "chatStateQueues",
    "chatConversation",
    "chatMessage",
    "feishuThreadState",
  ],
} as const satisfies Record<DataOwner, readonly string[]>;

// SAFETY: tablesByOwner is exhaustively constrained to DataOwner keys and every generated value is that key.
export const TABLE_OWNER = Object.fromEntries(
  Object.entries(tablesByOwner).flatMap(([owner, tables]) => tables.map((table) => [table, owner])),
) as Readonly<Record<string, DataOwner>>;

export const DOMAIN_TABLES = tablesByOwner;

export const DECLARED_CROSS_OWNER_WRITES = [] as const;

/** Classifies production sources by the domain whose use cases they implement. */
export function sourceOwner(relativePath: string): DataOwner | "platform-operations" | undefined {
  for (const owner of DATA_OWNERS) {
    if (relativePath.startsWith(`domains/${owner}/`)) {
      return owner;
    }
  }
  if (relativePath.startsWith("auth/")) {
    return "identity-access";
  }
  return undefined;
}
