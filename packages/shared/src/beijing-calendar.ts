const BEIJING_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Return the Beijing calendar-day key for an instant. */
export function toBeijingDayKey(date: Date = new Date()): string {
  return new Date(date.getTime() + BEIJING_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Represent the current Beijing calendar day as UTC midnight.
 *
 * This coordinate is intended for date-only grids and UTC date arithmetic; it
 * is not the real instant at which the Beijing day began.
 */
export function toBeijingCalendarDate(date: Date = new Date()): Date {
  return new Date(`${toBeijingDayKey(date)}T00:00:00.000Z`);
}

/** Return the real instant at which the date's Beijing calendar day began. */
export function startOfBeijingDay(date: Date = new Date()): Date {
  return new Date(toBeijingCalendarDate(date).getTime() - BEIJING_UTC_OFFSET_MS);
}
