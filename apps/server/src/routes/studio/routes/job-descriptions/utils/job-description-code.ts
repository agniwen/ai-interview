export const DEFAULT_JOB_CODE_PREFIX = "AUR";

const JOB_CODE_RANDOM_SPACE = 36 ** 4;
const JOB_CODE_CANDIDATE_COUNT = 32;

function toBase36Suffix(value: number): string {
  return value.toString(36).toUpperCase().padStart(4, "0");
}

export function normalizeJobCodePrefix(value: string | null | undefined): string {
  const normalized = value?.trim().toUpperCase() ?? "";
  return /^[A-Z0-9]{3}$/.test(normalized) ? normalized : DEFAULT_JOB_CODE_PREFIX;
}

export function generateJobDescriptionCode({
  prefix,
  random = Math.random,
}: {
  createdAt: Date;
  prefix: string | null | undefined;
  random?: () => number;
}): string {
  const randomValue = random();
  const index = Number.isFinite(randomValue)
    ? Math.min(
        JOB_CODE_RANDOM_SPACE - 1,
        Math.max(0, Math.trunc(randomValue * JOB_CODE_RANDOM_SPACE)),
      )
    : 0;
  return `${normalizeJobCodePrefix(prefix)}${toBase36Suffix(index)}`;
}

export function buildJobDescriptionCodeCandidates({
  prefix,
  random = Math.random,
}: {
  createdAt: Date;
  prefix: string | null | undefined;
  random?: () => number;
}): string[] {
  const randomValue = random();
  const startIndex = Number.isFinite(randomValue)
    ? Math.min(
        JOB_CODE_RANDOM_SPACE - 1,
        Math.max(0, Math.trunc(randomValue * JOB_CODE_RANDOM_SPACE)),
      )
    : 0;
  const normalizedPrefix = normalizeJobCodePrefix(prefix);
  return Array.from(
    { length: JOB_CODE_CANDIDATE_COUNT },
    (_, index) =>
      `${normalizedPrefix}${toBase36Suffix((startIndex + index) % JOB_CODE_RANDOM_SPACE)}`,
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
