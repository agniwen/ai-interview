export const MAIL_INGEST_PROVIDERS = [
  {
    id: "aliyun",
    imapHost: "imap.qiye.aliyun.com",
    imapPort: "993",
    label: "阿里云邮",
  },
] as const;

export type MailIngestProviderId = (typeof MAIL_INGEST_PROVIDERS)[number]["id"];

export const DEFAULT_MAIL_INGEST_PROVIDER_ID = "aliyun" satisfies MailIngestProviderId;

export function getMailIngestProvider(id: MailIngestProviderId) {
  return MAIL_INGEST_PROVIDERS.find((provider) => provider.id === id) ?? MAIL_INGEST_PROVIDERS[0];
}

export function applyMailIngestProvider<T extends { imapHost: string; imapPort: string }>(
  form: T,
  providerId: MailIngestProviderId,
): T {
  const provider = getMailIngestProvider(providerId);
  return {
    ...form,
    imapHost: provider.imapHost,
    imapPort: provider.imapPort,
  };
}

export function resolveMailIngestProviderId(
  imapHost: string,
  imapPort: string | number,
): MailIngestProviderId {
  const normalizedPort = String(imapPort);
  return (
    MAIL_INGEST_PROVIDERS.find(
      (provider) => provider.imapHost === imapHost && provider.imapPort === normalizedPort,
    )?.id ?? DEFAULT_MAIL_INGEST_PROVIDER_ID
  );
}
