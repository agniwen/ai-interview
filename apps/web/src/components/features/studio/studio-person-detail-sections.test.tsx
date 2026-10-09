import { describe, expect, it } from "vitest";
import type { StudioInterviewConversationReport } from "@app/db-schema/interview-session";
import { getReportFormItems } from "./studio-person-detail-sections";

describe("getReportFormItems", () => {
  it("uses the form answers frozen with the selected interview report", () => {
    // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
    const report = {
      snapshotMetadata: {
        fullTextInput: {
          formSubmissions: [
            {
              answers: [
                {
                  label: "期望到岗时间",
                  questionId: "question-1",
                  valueText: "两周内",
                },
              ],
              templateId: "template-1",
            },
          ],
        },
      },
    } as StudioInterviewConversationReport;

    expect(getReportFormItems(report)).toEqual([
      {
        analysis: null,
        answers: ["两周内"],
        id: "form-0-template-1-question-1",
        kind: "form",
        question: "期望到岗时间",
        sequence: 1,
      },
    ]);
  });

  it("returns null when an older report has no evidence snapshot", () => {
    // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
    expect(getReportFormItems({} as StudioInterviewConversationReport)).toBeNull();
  });
});
