const DATE_VALUE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME_VALUE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

function createValidatedLocalDate(parts: number[]): Date | undefined {
  const [year, month, day, hours = 0, minutes = 0] = parts;
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    month < 1 ||
    month > 12 ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return undefined;
  }

  const date = new Date(year, month - 1, day, hours, minutes);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hours ||
    date.getMinutes() !== minutes
  ) {
    return undefined;
  }
  return date;
}

export function parseDatePickerValue(value: string): Date | undefined {
  const match = DATE_VALUE_PATTERN.exec(value);
  return match ? createValidatedLocalDate(match.slice(1).map(Number)) : undefined;
}

export function parseDateTimePickerValue(value: string): Date | undefined {
  const match = DATE_TIME_VALUE_PATTERN.exec(value);
  return match ? createValidatedLocalDate(match.slice(1).map(Number)) : undefined;
}

export function formatDatePickerValue(date: Date): string {
  return [
    date.getFullYear(),
    "-",
    padDatePart(date.getMonth() + 1),
    "-",
    padDatePart(date.getDate()),
  ].join("");
}

export function formatDateTimePickerValue(date: Date): string {
  return [
    formatDatePickerValue(date),
    "T",
    padDatePart(date.getHours()),
    ":",
    padDatePart(date.getMinutes()),
  ].join("");
}
