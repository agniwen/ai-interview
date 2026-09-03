import { describe, expect, it } from "vitest";
import { isJobDescriptionFormTab } from "./job-description-form-dialog";

describe("structured job description preview flow tabs", () => {
  it.each(["basic", "interview-questions", "forms"])("accepts the %s tab", (tab) => {
    expect(isJobDescriptionFormTab(tab)).toBe(true);
  });

  it.each(["preview", "", "unknown"])("rejects an unsupported tab: %s", (tab) => {
    expect(isJobDescriptionFormTab(tab)).toBe(false);
  });
});
