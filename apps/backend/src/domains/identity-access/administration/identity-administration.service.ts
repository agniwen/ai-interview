import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { user } from "@arc/db-schema/schema";
import { API_DATABASE } from "../../../infrastructure/database/database.tokens.js";
import type { Database } from "../../../infrastructure/database/database.tokens.js";
import type {
  IdentityAdministrationCommands,
  IdentityAdministrationResult,
  IdentityAdministrationUserRemark,
} from "./identity-administration.commands.js";

@Injectable()
export class IdentityAdministrationService implements IdentityAdministrationCommands {
  constructor(@Inject(API_DATABASE) private readonly database: Database) {}

  async updateUserRemark(
    userId: string,
    remark: string | null | undefined,
  ): Promise<IdentityAdministrationResult<IdentityAdministrationUserRemark>> {
    const [updated] = await this.database
      .update(user)
      .set({ remark: remark?.trim() || null, updatedAt: new Date() })
      .where(eq(user.id, userId))
      .returning({ id: user.id, remark: user.remark, updatedAt: user.updatedAt });
    if (!updated) {
      return { error: { code: "USER_NOT_FOUND", userId }, ok: false };
    }
    return {
      ok: true,
      value: { ...updated, updatedAt: updated.updatedAt.toISOString() },
    };
  }
}
