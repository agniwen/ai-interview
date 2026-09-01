import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { interviewNotification } from "@arc/db-schema/schema";
import { API_DATABASE } from "../../../infrastructure/database/database.tokens.js";
import type { Database } from "../../../infrastructure/database/database.tokens.js";
import type {
  CandidateNotificationAdminCommands,
  CandidateNotificationAdminResult,
} from "./candidate-notification-admin.commands.js";

@Injectable()
export class CandidateNotificationAdminService implements CandidateNotificationAdminCommands {
  constructor(@Inject(API_DATABASE) private readonly database: Database) {}

  async resend(id: string): Promise<CandidateNotificationAdminResult> {
    const [row] = await this.database
      .update(interviewNotification)
      .set({
        error: null,
        lastErrorCode: null,
        nextAttemptAt: new Date(),
        status: "pending",
        updatedAt: new Date(),
      })
      .where(eq(interviewNotification.id, id))
      .returning({ id: interviewNotification.id, status: interviewNotification.status });
    return row
      ? { ok: true, value: { id: row.id, status: "pending" } }
      : { error: { code: "PLATFORM_NOTIFICATION_NOT_FOUND" }, ok: false };
  }
}
