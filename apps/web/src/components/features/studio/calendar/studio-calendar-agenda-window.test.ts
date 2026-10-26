import { differenceInCalendarDays, format } from "date-fns";
import { describe, expect, it } from "vitest";
import { agendaWindowRange } from "./studio-calendar-agenda-window";

describe("interview agenda window", () => {
  it("includes fourteen days either side of today, across month boundaries", () => {
    const { start, end } = agendaWindowRange(new Date(2026, 9, 26, 18));
    expect(format(start, "yyyy-MM-dd HH:mm")).toBe("2026-10-12 00:00");
    expect(format(end, "yyyy-MM-dd HH:mm")).toBe("2026-11-10 00:00");
    expect(differenceInCalendarDays(end, start)).toBe(29);
  });
});
