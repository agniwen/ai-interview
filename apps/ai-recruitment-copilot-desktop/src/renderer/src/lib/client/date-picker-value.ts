const DATE_VALUE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

export function parseDatePickerValue(value: string): Date | undefined {
  const match = DATE_VALUE_PATTERN.exec(value);
  if (!match) {
    return undefined;
  }
  const [year, month, day] = match.slice(1).map(Number);
  if (year === undefined || month === undefined || day === undefined || month < 1 || month > 12) {
    return undefined;
  }
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return undefined;
  }
  return date;
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
