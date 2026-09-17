import { describe, expect, it } from "vitest";
import { isJobDescriptionFormTab } from "./job-description-form-dialog";

describe("job description form tabs", () => {
  it.each(["basic", "interview-questions", "forms"])("accepts the %s tab", (tab) => {
    expect(isJobDescriptionFormTab(tab)).toBe(true);
  });

  it.each(["preview", "", "unknown"])("rejects an unsupported tab: %s", (tab) => {
    expect(isJobDescriptionFormTab(tab)).toBe(false);
  });
});
