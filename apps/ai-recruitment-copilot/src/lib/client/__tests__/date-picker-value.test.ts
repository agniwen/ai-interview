import { describe, expect, it } from "vitest";
import {
  formatDatePickerValue,
  formatDateTimePickerValue,
  parseDatePickerValue,
  parseDateTimePickerValue,
} from "../date-picker-value";

describe("date picker values", () => {
  it("parses and formats a local date without applying a timezone offset", () => {
    const date = parseDatePickerValue("2026-07-24");

    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(6);
    expect(date?.getDate()).toBe(24);
    expect(date && formatDatePickerValue(date)).toBe("2026-07-24");
  });

  it("parses and formats a local date and time without applying a timezone offset", () => {
    const date = parseDateTimePickerValue("2026-07-24T09:05");

    expect(date?.getHours()).toBe(9);
    expect(date?.getMinutes()).toBe(5);
    expect(date && formatDateTimePickerValue(date)).toBe("2026-07-24T09:05");
  });

  it("rejects dates and times that overflow their valid ranges", () => {
    expect(parseDatePickerValue("2026-02-30")).toBeUndefined();
    expect(parseDateTimePickerValue("2026-07-24T24:00")).toBeUndefined();
    expect(parseDateTimePickerValue("2026-07-24T09:60")).toBeUndefined();
  });
});
