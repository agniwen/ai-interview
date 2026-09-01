export const TOP_LEVEL_MEETING_LOCAL_RECOVERY_PORT = Symbol(
  "TOP_LEVEL_MEETING_LOCAL_RECOVERY_PORT",
);

export interface TopLevelMeetingLocalRecoveryPort {
  check(input: {
    actorId: string;
    manifestSha256: string;
    meetingId: string;
  }): Promise<"delete" | "retain">;
  recordCleanup(input: {
    actorId: string;
    manifestSha256: string;
    meetingId: string;
    status: "deleted" | "failed";
  }): Promise<void>;
}
