const ACTIVE_BATCH_UNIQUE_INDEX = "resume_upload_batch_active_unique_idx";

function getErrorString(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object" || !(key in value)) {
    return null;
  }
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === "string" ? raw : null;
}

export function isActiveBatchUniqueViolation(error: unknown): boolean {
  const mainMessage = error instanceof Error ? error.message.toLowerCase() : "";
  const cause = error instanceof Error ? error.cause : null;
  const causeMessage = cause instanceof Error ? cause.message.toLowerCase() : "";
  const causeCode = getErrorString(cause, "code");
  const causeConstraint = getErrorString(cause, "constraint_name");

  return (
    causeConstraint === ACTIVE_BATCH_UNIQUE_INDEX ||
    (causeCode === "23505" && `${mainMessage} ${causeMessage}`.includes(ACTIVE_BATCH_UNIQUE_INDEX))
  );
}
