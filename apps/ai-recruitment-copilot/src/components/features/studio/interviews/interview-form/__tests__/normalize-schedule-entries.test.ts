import { afterEach, describe, expect, it } from "vitest";
import { normalizeScheduleEntries } from "../index";

const originalTimeZone = process.env.TZ;

afterEach(() => {
  if (originalTimeZone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTimeZone;
  }
});

describe("normalizeScheduleEntries", () => {
  it("serializes datetime-local values as browser-local instants", () => {
    process.env.TZ = "Asia/Shanghai";

    expect(
      normalizeScheduleEntries([
        {
          allowTextInput: false,
          notes: "",
          roundLabel: "一面",
          scheduledAt: "2026-06-02T17:30",
          sortOrder: 99,
        },
      ]),
    ).toEqual([
      {
        allowTextInput: false,
        notes: "",
        roundLabel: "一面",
        scheduledAt: "2026-06-02T09:30:00.000Z",
        sortOrder: 0,
      },
    ]);
  });
});
