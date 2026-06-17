export interface MailIngestConfig {
  enabled: boolean;
  intervalMs: number;
  maxAccountsPerRun: number;
  maxMessagesPerAccount: number;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }
  return value.trim().toLowerCase() === "true";
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveMailIngestConfig(env: NodeJS.ProcessEnv = process.env): MailIngestConfig {
  return {
    enabled: parseBoolean(env.MAIL_INGEST_ENABLED, false),
    intervalMs: parsePositiveInteger(env.MAIL_INGEST_INTERVAL_MS, 15 * 60 * 1000),
    maxAccountsPerRun: parsePositiveInteger(env.MAIL_INGEST_MAX_ACCOUNTS_PER_RUN, 20),
    maxMessagesPerAccount: parsePositiveInteger(env.MAIL_INGEST_MAX_MESSAGES_PER_ACCOUNT, 20),
  };
}
