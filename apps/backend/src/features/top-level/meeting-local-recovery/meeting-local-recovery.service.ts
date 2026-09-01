import { Inject, Injectable } from "@nestjs/common";
import { meetingAuditLog } from "@arc/db-schema/schema";
import { TOP_LEVEL_DATABASE_PORT } from "../top-level.ports.js";
import type { TopLevelDatabasePort } from "../top-level.ports.js";
import type { TopLevelMeetingLocalRecoveryPort } from "./meeting-local-recovery.port.js";

@Injectable()
export class MeetingLocalRecoveryService implements TopLevelMeetingLocalRecoveryPort {
  constructor(
    @Inject(TOP_LEVEL_DATABASE_PORT)
    private readonly database: TopLevelDatabasePort,
  ) {}

  async check(input: {
    actorId: string;
    manifestSha256: string;
    meetingId: string;
  }): Promise<"delete" | "retain"> {
    const [meeting, tombstone] = await Promise.all([
      this.database.query.meetingSession.findFirst({
        columns: { status: true },
        where: {
          id: input.meetingId,
          manifestSha256: input.manifestSha256,
          ownerId: input.actorId,
        },
      }),
      this.database.query.meetingPurgeTombstone.findFirst({
        columns: { meetingId: true },
        where: {
          manifestSha256: input.manifestSha256,
          meetingId: input.meetingId,
          ownerId: input.actorId,
        },
      }),
    ]);
    return meeting?.status === "purging" || tombstone ? "delete" : "retain";
  }

  async recordCleanup(input: {
    actorId: string;
    manifestSha256: string;
    meetingId: string;
    status: "deleted" | "failed";
  }): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const [meeting, tombstone] = await Promise.all([
        transaction.query.meetingSession.findFirst({
          columns: { id: true, organizationId: true, status: true },
          where: {
            id: input.meetingId,
            manifestSha256: input.manifestSha256,
            ownerId: input.actorId,
          },
        }),
        transaction.query.meetingPurgeTombstone.findFirst({
          columns: { meetingId: true, organizationId: true },
          where: {
            manifestSha256: input.manifestSha256,
            meetingId: input.meetingId,
            ownerId: input.actorId,
          },
        }),
      ]);
      const organizationId = meeting?.organizationId ?? tombstone?.organizationId;
      if (!(organizationId && (meeting?.status === "purging" || tombstone))) {
        return;
      }
      await transaction.insert(meetingAuditLog).values({
        action: "meeting.local_recovery_cleanup_reported",
        actorId: input.actorId,
        detail: {
          deviceReported: true,
          meetingId: input.meetingId,
          status: input.status,
        },
        id: crypto.randomUUID(),
        meetingId: meeting?.id ?? null,
        organizationId,
      });
    });
  }
}
