import { ImapFlow } from "imapflow";

export interface MailIngestLoginConfig {
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  mailbox: string;
  password: string;
  username: string;
}

const VALIDATION_TIMEOUT_MS = 15_000;

export class MailIngestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailIngestValidationError";
  }
}

function formatValidationError(error: unknown) {
  const parts = [error instanceof Error ? error.message : String(error)];
  if (error && typeof error === "object") {
    const responseStatus = "responseStatus" in error ? error.responseStatus : null;
    const responseText = "responseText" in error ? error.responseText : null;
    if (typeof responseStatus === "string" && responseStatus.trim()) {
      parts.push(responseStatus.trim());
    }
    if (typeof responseText === "string" && responseText.trim()) {
      parts.push(responseText.trim());
    }
  }
  return parts.filter(Boolean).join(" · ");
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
      `邮箱登录校验失败：${formatValidationError(error) || "请检查 IMAP 配置、账号或授权码。"}`,
    );
  } finally {
    if (connected) {
      await client.logout().catch((logoutError) => {
        console.warn("[mail-ingest] IMAP validation logout failed:", logoutError);
      });
    }
  }
}
