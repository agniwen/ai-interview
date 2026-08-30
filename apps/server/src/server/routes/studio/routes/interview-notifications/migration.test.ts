import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../../../../../../web/drizzle/20260820123000_interview_notification_foundation/migration.sql",
    import.meta.url,
  ),
  "utf-8",
);
const roundlessNotificationMigration = readFileSync(
  new URL(
    "../../../../../../../web/drizzle/20260824090000_interview_notification_roundless_copy/migration.sql",
    import.meta.url,
  ),
  "utf-8",
);
const aiHrInitialCopyMigration = readFileSync(
  new URL(
    "../../../../../../../web/drizzle/20260824093000_ai_hr_initial_notification_copy/migration.sql",
    import.meta.url,
  ),
  "utf-8",
);
const aiInvitationExceptionMigration = readFileSync(
  new URL(
    "../../../../../../../web/drizzle/20260825030000_ai_invitation_exception_notifications/migration.sql",
    import.meta.url,
  ),
  "utf-8",
);
const aiInvitationExceptionCandidateEmailMigration = readFileSync(
  new URL(
    "../../../../../../../web/drizzle/20260825040000_ai_invitation_exception_candidate_email/migration.sql",
    import.meta.url,
  ),
  "utf-8",
);
const humanDirectConfirmationMigration = readFileSync(
  new URL(
    "../../../../../../../web/drizzle/20260825050000_human_interview_direct_confirmation_notifications/migration.sql",
    import.meta.url,
  ),
  "utf-8",
);
const humanConfirmationRecipientCleanupMigration = readFileSync(
  new URL(
    "../../../../../../../web/drizzle/20260825051000_human_interview_confirmation_recipient_cleanup/migration.sql",
    import.meta.url,
  ),
  "utf-8",
);
const humanExternalNotificationCopyMigration = readFileSync(
  new URL(
    "../../../../../../../web/drizzle/20260826143000_human_interview_external_notification_copy/migration.sql",
    import.meta.url,
  ),
  "utf-8",
);
const humanProgressionInvitationCopyMigration = readFileSync(
  new URL(
    "../../../../../../../web/drizzle/20260826152000_human_interview_progression_invitation_copy/migration.sql",
    import.meta.url,
  ),
  "utf-8",
);
const aiInterviewCompletionCopyMigration = readFileSync(
  new URL(
    "../../../../../../../web/drizzle/20260829100000_ai_interview_completion_copy/migration.sql",
    import.meta.url,
  ),
  "utf-8",
);

describe("interview notification foundation migration", () => {
  it("adds the outbox, template, and recipient boundaries", () => {
    expect(migration).toContain('CREATE TABLE "interview_notification_event"');
    expect(migration).toContain('CREATE TABLE "interview_notification_template"');
    expect(migration).toContain('CREATE TABLE "interview_notification_template_version"');
    expect(migration).toContain('CREATE TABLE "studio_interview_notification_recipient"');
    expect(migration).toContain('"interview_notification_event_dedupe_uq"');
    expect(migration).toContain('"studio_interview_notification_recipient_member_org_fk"');
    expect(migration).toContain("system_ai_report_selected_hr_feishu_v1");
    expect(migration).toContain("system_human_rescheduled_candidate_email_v1");
    expect(migration).toContain('SET "active_version_id"');
  });

  it("keeps the delivery migration additive for the legacy Feishu report path", () => {
    expect(migration).toContain('ALTER TABLE "interview_notification"');
    expect(migration).toContain('ADD COLUMN "event_id" text');
    expect(migration).toContain('ADD COLUMN "channel" text');
    expect(migration).not.toMatch(/DROP (?:TABLE|COLUMN|CONSTRAINT)/);
    expect(migration).not.toContain('ALTER COLUMN "provider_id"');
    expect(migration).not.toContain('ALTER COLUMN "recipient_open_id"');
  });

  it("versions candidate invitations and human meeting schedules", () => {
    expect(migration).toContain('ADD COLUMN "invitation_version" integer DEFAULT 1 NOT NULL');
    expect(migration).toContain('ADD COLUMN "schedule_version" integer DEFAULT 1 NOT NULL');
    expect(migration).toContain('"studio_interview_schedule_invite_token_uq"');
  });
});

describe("roundless interview notification copy migration", () => {
  it("separates candidate invitation from interviewer confirmation", () => {
    expect(roundlessNotificationMigration).toContain("human_candidate_invitation_requested");
    expect(roundlessNotificationMigration).toContain(
      "system_human_candidate_invitation_candidate_email",
    );
    expect(roundlessNotificationMigration).toContain(
      "system_human_confirmation_requested_candidate_email';",
    );
  });

  it("keeps business round labels out of notification copy", () => {
    expect(roundlessNotificationMigration).not.toContain("{{roundName}}");
    expect(roundlessNotificationMigration).not.toContain("面试轮次：");
  });
});

describe("AI HR initial notification copy migration", () => {
  it("publishes the approved candidate invitation and HR feedback copy", () => {
    expect(aiHrInitialCopyMigration).toContain("正式进入第一轮 HR 初面环节");
    expect(aiHrInitialCopyMigration).toContain("{{invitationStartTime}}");
    expect(aiHrInitialCopyMigration).toContain("{{invitationEndTime}}");
    expect(aiHrInitialCopyMigration).toContain("接受 第一轮 HR 面试");
    expect(aiHrInitialCopyMigration).toContain("拒绝 第一轮 HR 面试");
    expect(aiHrInitialCopyMigration).toContain("{{responseTime}}");
    expect(aiHrInitialCopyMigration).toContain("\"template_id\" || '_v3'");
  });
});

describe("AI invitation exception notification migration", () => {
  it("publishes additive HR Feishu templates for invitation exceptions", () => {
    expect(aiInvitationExceptionMigration).toContain("ai_invitation_exception");
    expect(aiInvitationExceptionMigration).toContain(
      "system_ai_invitation_exception_selected_hr_feishu_v1",
    );
    expect(aiInvitationExceptionMigration).toContain(
      "system_ai_invitation_exception_initiator_feishu_v1",
    );
    expect(aiInvitationExceptionMigration).toContain("{{exceptionType}}");
    expect(aiInvitationExceptionMigration).toContain("{{occurredAt}}");
    expect(aiInvitationExceptionMigration).toContain("{{suggestedAction}}");
    expect(aiInvitationExceptionMigration).not.toMatch(/DROP (?:TABLE|COLUMN|CONSTRAINT)/);
  });

  it("publishes the candidate email template for invitation exceptions", () => {
    expect(aiInvitationExceptionCandidateEmailMigration).toContain(
      "system_ai_invitation_exception_candidate_email",
    );
    expect(aiInvitationExceptionCandidateEmailMigration).toContain("ai_invitation_exception");
    expect(aiInvitationExceptionCandidateEmailMigration).toContain("candidate");
    expect(aiInvitationExceptionCandidateEmailMigration).toContain("email");
    expect(aiInvitationExceptionCandidateEmailMigration).toContain("接受面试异常");
    expect(aiInvitationExceptionCandidateEmailMigration).not.toMatch(
      /DROP (?:TABLE|COLUMN|CONSTRAINT)/,
    );
  });
});

describe("AI interview completion notification migration", () => {
  it("publishes completion-aware HR Feishu copy", () => {
    expect(aiInterviewCompletionCopyMigration).toContain("{{completionNotice}}");
    expect(aiInterviewCompletionCopyMigration).toContain("{{interviewLink}}");
    expect(aiInterviewCompletionCopyMigration).toContain(
      "system_ai_completed_selected_hr_feishu_v3",
    );
    expect(aiInterviewCompletionCopyMigration).toContain("system_ai_completed_initiator_feishu_v3");
    expect(aiInterviewCompletionCopyMigration).not.toMatch(/DROP (?:TABLE|COLUMN|CONSTRAINT)/);
  });
});

describe("human interview direct confirmation migration", () => {
  it("disables selected HR and interviewer confirmation request templates", () => {
    expect(humanDirectConfirmationMigration).toContain("\"audience_type\" = 'selected_hr_user'");
    expect(humanDirectConfirmationMigration).toContain(
      "'human_interviewer_confirmation_requested'",
    );
    expect(humanDirectConfirmationMigration).toContain(
      "system_human_invitation_exception_candidate_email",
    );
  });

  it("publishes direct confirmation, reminders, and cumulative evaluation copy", () => {
    expect(humanDirectConfirmationMigration).toContain("业务复试安排已确认");
    expect(humanDirectConfirmationMigration).toContain("{{reminderLeadTime}}");
    expect(humanDirectConfirmationMigration).toContain("{{evaluationSummary}}");
    expect(humanDirectConfirmationMigration).toContain("system_human_completed_initiator_email");
    expect(humanDirectConfirmationMigration).not.toMatch(/DROP (?:COLUMN|CONSTRAINT)/);
  });

  it("keeps formal confirmation on candidate and interviewers without duplicating HR feedback", () => {
    expect(humanConfirmationRecipientCleanupMigration).toContain("human_interview_confirmed");
    expect(humanConfirmationRecipientCleanupMigration).toContain("initiator_fallback");
    expect(humanConfirmationRecipientCleanupMigration).toContain('"enabled" = false');
  });
});

describe("human interview external notification copy migration", () => {
  it("removes candidate-facing interviewer and internal workflow fields", () => {
    const candidateConfirmation = humanExternalNotificationCopyMigration.match(
      /system_human_confirmed_candidate_email[^;]+/,
    )?.[0];
    expect(candidateConfirmation).toBeDefined();
    expect(candidateConfirmation).not.toContain("{{interviewerNames}}");
    expect(humanExternalNotificationCopyMigration).not.toContain("{{changeReason}}");
    expect(humanExternalNotificationCopyMigration).not.toContain("当前状态");
  });

  it("publishes round-aware cancellation, reschedule, and reminder version five copy", () => {
    expect(humanExternalNotificationCopyMigration).toContain("面试轮次：{{roundName}}");
    expect(humanExternalNotificationCopyMigration).toContain("原面试时间");
    expect(humanExternalNotificationCopyMigration).toContain("新面试时间");
    expect(humanExternalNotificationCopyMigration).toContain("正式面试时间");
    expect(humanExternalNotificationCopyMigration).toContain("{{reminderLeadTime}}");
    expect(humanExternalNotificationCopyMigration).toContain("\"template_id\" || '_v5'");
    expect(humanExternalNotificationCopyMigration).not.toMatch(/DROP (?:COLUMN|CONSTRAINT)/);
  });
});

describe("human interview progression invitation copy migration", () => {
  it("publishes dynamic previous and current business round context", () => {
    expect(humanProgressionInvitationCopyMigration).toContain("{{previousRoundNumber}}");
    expect(humanProgressionInvitationCopyMigration).toContain("{{previousRoundName}}");
    expect(humanProgressionInvitationCopyMigration).toContain("{{currentRoundNumber}}");
    expect(humanProgressionInvitationCopyMigration).toContain(
      "system_human_candidate_invitation_candidate_email_v6",
    );
    expect(humanProgressionInvitationCopyMigration).not.toMatch(/DROP (?:TABLE|COLUMN|CONSTRAINT)/);
  });
});
