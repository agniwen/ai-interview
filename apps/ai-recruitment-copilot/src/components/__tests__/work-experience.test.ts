import { describe, expect, it } from "vitest";
import { formatWorkExperienceDuration } from "@/components/work-experience";

describe("formatWorkExperienceDuration", () => {
  it("formats year and month durations in Chinese", () => {
    expect(formatWorkExperienceDuration("01.2020", "03.2024")).toBe("4年3个月");
    expect(formatWorkExperienceDuration("01.2024", "03.2024")).toBe("3个月");
    expect(formatWorkExperienceDuration("2020", "2024")).toBe("4年");
  });
});
