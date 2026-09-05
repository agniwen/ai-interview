import { describe, expect, it } from "vitest";
import {
  hashTemplateSnapshot,
  hashTemplateSourceSnapshot,
} from "./interview-question-templates-hash";
import type { InterviewQuestionTemplateSnapshot } from "@app/db-schema/interview-question-templates";

const snapshot: InterviewQuestionTemplateSnapshot = {
  description: null,
  jobDescriptionIds: [],
  questions: [
    {
      content: "请介绍最近两份工作的岗位和团队情况。",
      difficulty: "medium",
      evaluationFocus: "确认真实履历",
      followUpDirections: "缺失时追问",
      id: "question-1",
      sortOrder: 0,
    },
  ],
  scope: "global",
  templateId: "template-1",
  title: "通用沟通题",
};

describe("hashTemplateSnapshot", () => {
  it("versions contracts while keeping a separate stable source identity", () => {
    const [question] = snapshot.questions;
    if (!question) {
      throw new Error("expected fixture question");
    }
    const withContract: InterviewQuestionTemplateSnapshot = {
      ...snapshot,
      questions: [
        {
          ...question,
          followUpContract: {
            coverageMode: "all_required",
            facets: [
              {
                id: "facet-role",
                label: "岗位",
                sourceField: "question",
                sourceText: "岗位",
              },
            ],
            schemaVersion: 1,
          },
        },
      ],
    };

    expect(hashTemplateSnapshot(withContract)).not.toBe(hashTemplateSnapshot(snapshot));
    expect(hashTemplateSourceSnapshot(withContract)).toBe(hashTemplateSourceSnapshot(snapshot));
  });
});
