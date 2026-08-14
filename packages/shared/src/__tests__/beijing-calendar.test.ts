import { describe, expect, it } from "vitest";
import { startOfBeijingDay, toBeijingCalendarDate, toBeijingDayKey } from "../beijing-calendar";

describe("Beijing calendar dates", () => {
  it("advances to August 5 at Beijing midnight even while UTC is August 4", () => {
    const now = new Date("2026-08-04T23:52:19.000Z");

    expect(toBeijingDayKey(now)).toBe("2026-08-05");
    expect(toBeijingCalendarDate(now).toISOString()).toBe("2026-08-05T00:00:00.000Z");
    expect(startOfBeijingDay(now).toISOString()).toBe("2026-08-04T16:00:00.000Z");
  });

  it("keeps August 4 immediately before Beijing midnight", () => {
    const now = new Date("2026-08-04T15:59:59.999Z");

    expect(toBeijingDayKey(now)).toBe("2026-08-04");
    expect(toBeijingCalendarDate(now).toISOString()).toBe("2026-08-04T00:00:00.000Z");
    expect(startOfBeijingDay(now).toISOString()).toBe("2026-08-03T16:00:00.000Z");
  });
});
