import { ImapFlow } from "imapflow";
import { z } from "zod";

export interface MailIngestLoginConfig {
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  mailbox: string;
  password: string;
  username: string;
}

const VALIDATION_TIMEOUT_MS = 15_000;
const imapValidationErrorSchema = z.union([
  z.instanceof(Error),
  z.object({
    message: z.string().optional(),
    responseStatus: z.string().optional(),
    responseText: z.string().optional(),
  }),
]);

export class MailIngestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailIngestValidationError";
  }
}

function formatValidationError(error: z.output<typeof imapValidationErrorSchema>) {
  if (error instanceof Error) {
    return error.message;
  }
  return [error.message, error.responseStatus, error.responseText]
    .filter((part): part is string => Boolean(part?.trim()))
    .map((part) => part.trim())
    .join(" · ");
}

export function mergeMailIngestLoginConfig(
  existing: MailIngestLoginConfig,
  input: Partial<MailIngestLoginConfig>,
): MailIngestLoginConfig {
  return {
    imapHost: input.imapHost ?? existing.imapHost,
    imapPort: input.imapPort ?? existing.imapPort,
    imapSecure: input.imapSecure ?? existing.imapSecure,
    mailbox: input.mailbox ?? existing.mailbox,
    password: input.password ?? existing.password,
    username: input.username ?? existing.username,
  };
}

export async function validateMailIngestAccountLogin(input: MailIngestLoginConfig): Promise<void> {
  const client = new ImapFlow({
    auth: {
      pass: input.password,
      user: input.username,
    },
    connectionTimeout: VALIDATION_TIMEOUT_MS,
    greetingTimeout: VALIDATION_TIMEOUT_MS,
    host: input.imapHost,
    logger: false,
    port: input.imapPort,
    secure: input.imapSecure,
    socketTimeout: VALIDATION_TIMEOUT_MS,
  });
  client.on("error", (error) => {
    console.warn("[mail-ingest] IMAP validation client error:", error);
  });

  let connected = false;
  try {
    await client.connect();
    connected = true;
    const lock = await client.getMailboxLock(input.mailbox);
    lock.release();
  } catch (error) {
    throw new MailIngestValidationError(
      `邮箱登录校验失败：${formatValidationError(imapValidationErrorSchema.parse(error)) || "请检查 IMAP 配置、账号或授权码。"}`,
    );
  } finally {
    if (connected) {
      await client.logout().catch((logoutError) => {
        console.warn("[mail-ingest] IMAP validation logout failed:", logoutError);
      });
    }
  }
}
