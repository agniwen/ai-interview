import { and, eq } from "drizzle-orm";
import { meetingStorageCleanupKey } from "@app/db-schema/schema";
import type { Database } from "@app/database";
import { lockEchoDeviceMeeting } from "./ownership-dao";
import type { EchoProcessingActor } from "./ownership-dao";

export function registerEchoArtifact(
  db: Database,
  input: EchoProcessingActor & { storageKey: string },
) {
  return db.transaction(async (tx) => {
    await lockEchoDeviceMeeting(tx, input);
    const writerLeaseExpiresAt = new Date(Date.now() + 121 * 60 * 1000);
    await tx
      .insert(meetingStorageCleanupKey)
      .values({
        meetingId: input.meetingId,
        organizationId: input.organizationId,
        storageKey: input.storageKey,
        writerLeaseExpiresAt,
      })
      .onConflictDoUpdate({
        set: { finalSweepCompletedAt: null, initialSweepCompletedAt: null, writerLeaseExpiresAt },
        target: meetingStorageCleanupKey.storageKey,
      });
  });
}

export async function retireEchoArtifact(
  db: Database,
  input: EchoProcessingActor & { storageKey: string },
) {
  await db
    .delete(meetingStorageCleanupKey)
    .where(
      and(
        eq(meetingStorageCleanupKey.meetingId, input.meetingId),
        eq(meetingStorageCleanupKey.organizationId, input.organizationId),
        eq(meetingStorageCleanupKey.storageKey, input.storageKey),
      ),
    );
}
