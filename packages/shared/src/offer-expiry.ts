const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Offer 有效期是北京时间自然日，包含截止当天；兼容旧版存储的 UTC 零点。 */
export function offerExpiryEndOfDay(value: Date | string): Date {
  const timestamp = new Date(value).getTime();
  return new Date(
    Math.floor((timestamp + BEIJING_OFFSET_MS) / DAY_MS) * DAY_MS + DAY_MS - BEIJING_OFFSET_MS - 1,
  );
}

export function isOfferExpired(value: Date | string | null, now = new Date()): boolean {
  return value !== null && now.getTime() > offerExpiryEndOfDay(value).getTime();
}
