export const DEFAULT_JOB_CODE_PREFIX = "AUR";

const JOB_CODE_PREFIX_PATTERN = /^[A-Z0-9]{1,12}$/;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function normalizeJobCodePrefix(value: string | null | undefined): string {
  const normalized = value?.trim().toUpperCase() ?? "";
  if (!normalized) {
    return DEFAULT_JOB_CODE_PREFIX;
  }
  return normalized;
}

export function isValidJobCodePrefix(value: string): boolean {
  return JOB_CODE_PREFIX_PATTERN.test(value);
}

export function formatJobCodeTimestamp(createdAt: Date): string {
  return [
    pad2(createdAt.getUTCFullYear() % 100),
    pad2(createdAt.getUTCMonth() + 1),
    pad2(createdAt.getUTCDate()),
    pad2(createdAt.getUTCHours()),
    pad2(createdAt.getUTCMinutes()),
  ].join("");
}

export function generateJobDescriptionCode({
  createdAt,
  prefix,
  randomDigit = () => Math.floor(Math.random() * 10),
}: {
  createdAt: Date;
  prefix: string | null | undefined;
  randomDigit?: () => number;
}): string {
  const digit = Math.trunc(randomDigit());
  const safeDigit = Number.isFinite(digit) ? Math.min(9, Math.max(0, digit)) : 0;
  return `${normalizeJobCodePrefix(prefix)}${formatJobCodeTimestamp(createdAt)}${safeDigit}`;
}

export function buildJobDescriptionCodeCandidates({
  createdAt,
  prefix,
  random = Math.random,
}: {
  createdAt: Date;
  prefix: string | null | undefined;
  random?: () => number;
}): string[] {
  const randomValue = random();
  const start = Number.isFinite(randomValue)
    ? Math.min(9, Math.max(0, Math.trunc(randomValue * 10)))
    : 0;
  return Array.from({ length: 10 }, (_, index) =>
    generateJobDescriptionCode({
      createdAt,
      prefix,
      randomDigit: () => (start + index) % 10,
    }),
  );
}

export function pickAvailableJobDescriptionCode(
  candidates: readonly string[],
  usedCodes: readonly (string | null)[],
): string | null {
  const used = new Set(
    usedCodes.filter((code): code is string => code !== null && code.length > 0),
  );
  return candidates.find((code) => !used.has(code)) ?? null;
}
