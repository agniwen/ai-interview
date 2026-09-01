export const MEETING_LOCAL_RECOVERY_PORT = Symbol("MEETING_LOCAL_RECOVERY_PORT");

export interface MeetingLocalRecoveryPort {
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
