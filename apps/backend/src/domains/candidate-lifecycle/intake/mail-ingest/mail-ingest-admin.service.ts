import { rawBackendEnvironment } from "../../../../config/raw-backend-environment.js";
import { Inject, Injectable } from "@nestjs/common";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { ImapFlow } from "imapflow";
import { and, eq } from "drizzle-orm";
import { mailIngestAccount, member } from "@arc/db-schema/schema";
import { API_DATABASE } from "../../../../infrastructure/database/database.tokens.js";
import type { Database } from "../../../../infrastructure/database/database.tokens.js";
import type {
  MailIngestAdminAccount,
  MailIngestAdminCommands,
  MailIngestAdminResult,
} from "./mail-ingest-admin.commands.js";

function encryptMailPassword(value: string): MailIngestAdminResult<string> {
  const secret = rawBackendEnvironment.MAIL_INGEST_SECRET_KEY?.trim();
  if (!secret) {
    return { error: { code: "MAIL_INGEST_SECRET_MISSING" }, ok: false };
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf-8"), cipher.final()]);
  return {
    ok: true,
    value: [
      "v1",
      iv.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      encrypted.toString("base64url"),
    ].join(":"),
  };
}

function presentMailAccount(row: typeof mailIngestAccount.$inferSelect): MailIngestAdminAccount {
  const { encryptedPassword: _encryptedPassword, ...safe } = row;
  return {
    ...safe,
    createdAt: safe.createdAt.toISOString(),
    lastCheckedAt: safe.lastCheckedAt?.toISOString() ?? null,
    listenStartAt: safe.listenStartAt?.toISOString() ?? null,
    pollingStartedAt: safe.pollingStartedAt?.toISOString() ?? null,
    updatedAt: safe.updatedAt.toISOString(),
  };
}

@Injectable()
export class MailIngestAdminService implements MailIngestAdminCommands {
  constructor(@Inject(API_DATABASE) private readonly database: Database) {}

  private async validateLogin(input: {
    imapHost: string;
    imapPort: number;
    imapSecure: boolean;
    password: string;
    username: string;
  }): Promise<MailIngestAdminResult<void>> {
    const client = new ImapFlow({
      auth: { pass: input.password, user: input.username },
      host: input.imapHost,
      logger: false,
      port: input.imapPort,
      secure: input.imapSecure,
    });
    try {
      await client.connect();
      return { ok: true, value: undefined };
    } catch (error) {
      return {
        error: {
          code: "MAIL_INGEST_LOGIN_FAILED",
          message: error instanceof Error ? error.message : "IMAP login failed",
        },
        ok: false,
      };
    } finally {
      if (client.usable) {
        await client.logout().catch(() => null);
      }
    }
  }

  async create(
    input: Parameters<MailIngestAdminCommands["create"]>[0],
  ): ReturnType<MailIngestAdminCommands["create"]> {
    const [scope] = await this.database
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.organizationId, input.organizationId), eq(member.userId, input.userId)))
      .limit(1);
    if (!scope) {
      return { error: { code: "MAIL_INGEST_MEMBER_NOT_FOUND" }, ok: false };
    }

    const validation = await this.validateLogin(input);
    if (!validation.ok) {
      return validation;
    }
    const encryptedPassword = encryptMailPassword(input.password);
    if (!encryptedPassword.ok) {
      return encryptedPassword;
    }

    const [row] = await this.database
      .insert(mailIngestAccount)
      .values({
        emailAddress: input.emailAddress,
        enabled: input.enabled,
        encryptedPassword: encryptedPassword.value,
        failedMailbox: input.failedMailbox,
        id: crypto.randomUUID(),
        imapHost: input.imapHost,
        imapPort: input.imapPort,
        imapSecure: input.imapSecure,
        listenStartAt: input.listenStartAt ? new Date(input.listenStartAt) : null,
        mailbox: input.mailbox,
        organizationId: input.organizationId,
        processedMailbox: input.processedMailbox,
        subjectKeyword: input.subjectKeyword,
        userId: input.userId,
        username: input.username,
      })
      .returning();
    return row
      ? { ok: true, value: presentMailAccount(row) }
      : { error: { code: "MAIL_INGEST_ACCOUNT_NOT_FOUND" }, ok: false };
  }

  async update(
    id: string,
    input: Parameters<MailIngestAdminCommands["update"]>[1],
  ): ReturnType<MailIngestAdminCommands["update"]> {
    const [existing] = await this.database
      .select()
      .from(mailIngestAccount)
      .where(
        and(
          eq(mailIngestAccount.id, id),
          eq(mailIngestAccount.organizationId, input.organizationId),
        ),
      )
      .limit(1);
    if (!existing) {
      return { error: { code: "MAIL_INGEST_ACCOUNT_NOT_FOUND" }, ok: false };
    }

    const encryptedPassword = input.password ? encryptMailPassword(input.password) : undefined;
    if (encryptedPassword && !encryptedPassword.ok) {
      return encryptedPassword;
    }
    let listenStartAt: Date | null | undefined;
    if (input.listenStartAt === null) {
      listenStartAt = null;
    } else if (input.listenStartAt !== undefined) {
      listenStartAt = new Date(input.listenStartAt);
    }
    const [row] = await this.database
      .update(mailIngestAccount)
      .set({
        emailAddress: input.emailAddress,
        enabled: input.enabled,
        encryptedPassword: encryptedPassword?.value,
        failedMailbox: input.failedMailbox,
        imapHost: input.imapHost,
        imapPort: input.imapPort,
        imapSecure: input.imapSecure,
        listenStartAt,
        mailbox: input.mailbox,
        processedMailbox: input.processedMailbox,
        subjectKeyword: input.subjectKeyword,
        updatedAt: new Date(),
        username: input.username,
      })
      .where(eq(mailIngestAccount.id, id))
      .returning();
    return row
      ? { ok: true, value: presentMailAccount(row) }
      : { error: { code: "MAIL_INGEST_ACCOUNT_NOT_FOUND" }, ok: false };
  }
}
