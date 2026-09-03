export const MAIL_INGEST_PLATFORMS = [
  {
    id: "boss_zhipin",
    label: "boss直聘",
    subjectKeyword: "boss直聘",
  },
] as const;

export type MailIngestPlatformId = (typeof MAIL_INGEST_PLATFORMS)[number]["id"];

export const DEFAULT_MAIL_INGEST_PLATFORM_ID = "boss_zhipin" satisfies MailIngestPlatformId;

export function getMailIngestPlatform(id: MailIngestPlatformId) {
  return MAIL_INGEST_PLATFORMS.find((platform) => platform.id === id) ?? MAIL_INGEST_PLATFORMS[0];
}

export function isMailIngestPlatformId(value: string): value is MailIngestPlatformId {
  return MAIL_INGEST_PLATFORMS.some((platform) => platform.id === value);
}

export function resolveMailIngestPlatformId(subjectKeyword: string): MailIngestPlatformId {
  return (
    MAIL_INGEST_PLATFORMS.find((platform) => platform.subjectKeyword === subjectKeyword.trim())
      ?.id ?? DEFAULT_MAIL_INGEST_PLATFORM_ID
  );
}
