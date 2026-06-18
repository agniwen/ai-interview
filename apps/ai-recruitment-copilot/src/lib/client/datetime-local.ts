/**
 * Convert a browser `<input type="datetime-local">` value into an ISO instant.
 * The input string is timezone-less by design, so this must run on the client
 * where `new Date(value)` uses the user's local timezone.
 */
export function dateTimeLocalInputToISOString(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

export function isoStringToDateTimeLocalInput(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return [
    date.getFullYear(),
    "-",
    padDatePart(date.getMonth() + 1),
    "-",
    padDatePart(date.getDate()),
    "T",
    padDatePart(date.getHours()),
    ":",
    padDatePart(date.getMinutes()),
  ].join("");
}
