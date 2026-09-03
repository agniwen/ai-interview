import { describe, expect, it } from "vitest";
import {
  humanInterviewRoundInputSchema,
  studioInterviewClientFormSchema,
  studioInterviewFormSchema,
} from "@app/db-schema/studio-interviews";

const scheduleEntry = {
  allowTextInput: false,
  notes: "",
  roundLabel: "一面",
  sortOrder: 0,
};

const baseInterviewInput = {
  candidateEmail: "candidate@example.com",
  candidateName: "候选人",
  candidatePhone: "",
  jobDescriptionId: "jd_1",
  notes: "",
  targetRole: "",
};

describe("studio interview timestamp input schemas", () => {
  it("requires explicit timezone information for server schedule entries", () => {
    expect(
      studioInterviewFormSchema.safeParse({
        ...baseInterviewInput,
        scheduleEntries: [
          {
            ...scheduleEntry,
            scheduledAt: "2026-06-02T17:30",
            scheduledEndAt: "2026-06-02T18:30",
          },
        ],
      }).success,
    ).toBe(false);

    expect(
      studioInterviewFormSchema.safeParse({
        ...baseInterviewInput,
        scheduleEntries: [
          {
            ...scheduleEntry,
            scheduledAt: "2026-06-02T09:30:00.000Z",
            scheduledEndAt: "2026-06-02T10:30:00.000Z",
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("keeps datetime-local values valid for the client form before submit normalization", () => {
    expect(
      studioInterviewClientFormSchema.safeParse({
        ...baseInterviewInput,
        interviewQuestions: [],
        scheduleEntries: [
          {
            ...scheduleEntry,
            scheduledAt: "2026-06-02T17:30",
            scheduledEndAt: "2026-06-02T18:30",
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("requires paired AI interview times with the end after the start", () => {
    expect(
      studioInterviewFormSchema.safeParse({
        ...baseInterviewInput,
        scheduleEntries: [
          {
            ...scheduleEntry,
            scheduledAt: "2026-06-02T09:30:00.000Z",
            scheduledEndAt: "",
          },
        ],
      }).success,
    ).toBe(false);

    expect(
      studioInterviewFormSchema.safeParse({
        ...baseInterviewInput,
        scheduleEntries: [
          {
            ...scheduleEntry,
            scheduledAt: "2026-06-02T09:30:00.000Z",
            scheduledEndAt: "2026-06-02T09:00:00.000Z",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("requires explicit timezone information for human interview schedules", () => {
    expect(
      humanInterviewRoundInputSchema.safeParse({
        format: "online",
        interviewerIds: ["u_1"],
        label: "一面",
        scheduledAt: "2026-06-02T17:30",
      }).success,
    ).toBe(false);

    expect(
      humanInterviewRoundInputSchema.safeParse({
        format: "online",
        interviewerIds: ["u_1"],
        label: "一面",
        scheduledAt: "2026-06-02T09:30:00.000Z",
      }).success,
    ).toBe(true);
  });
});
