export const CANDIDATE_NOTIFICATION_ADMIN_COMMANDS = Symbol(
  "CANDIDATE_NOTIFICATION_ADMIN_COMMANDS",
);

export type CandidateNotificationAdminResult =
  | { value: { id: string; status: "pending" }; ok: true }
  | { error: { code: "PLATFORM_NOTIFICATION_NOT_FOUND" }; ok: false };

export interface CandidateNotificationAdminCommands {
  resend(id: string): Promise<CandidateNotificationAdminResult>;
}
