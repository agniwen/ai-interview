// @vitest-environment jsdom

import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { InterviewQuestionTemplateRecord } from "@app/db-schema/interview-question-templates";
import {
  enableReactActEnvironment,
  installNoopResizeObserver,
  renderInAct,
  unmountInAct,
  waitForUi,
} from "@/test-utils/react-act";
import { InterviewQuestionTemplateEditorDialog } from "../interview-question-template-editor-dialog";

enableReactActEnvironment();
installNoopResizeObserver();

// SAFETY: The jsdom fixture provides the media-query API consumed by use-mobile.
window.matchMedia = ((query: string) => ({
  addEventListener: () => {},
  addListener: () => {},
  dispatchEvent: () => false,
  matches: false,
  media: query,
  onchange: null,
  removeEventListener: () => {},
  removeListener: () => {},
})) as typeof window.matchMedia;

const roots: Awaited<ReturnType<typeof renderInAct>>["root"][] = [];

afterEach(async () => {
  for (const root of roots) {
    await unmountInAct(root);
  }
  roots.length = 0;
});

describe("InterviewQuestionTemplateEditorDialog", () => {
  it("shows contracts for saved questions with evaluation focus or follow-up directions", async () => {
    const now = "2026-09-03T00:00:00.000Z";
    const record: InterviewQuestionTemplateRecord = {
      archivedAt: null,
      createdAt: now,
      createdBy: "user-1",
      description: null,
      id: "template-1",
      jobDescriptionIds: [],
      jobDescriptions: [],
      questions: [
        {
          content: "请介绍最近一份工作。",
          createdAt: now,
          difficulty: "easy",
          evaluationFocus: "确认候选人的最近岗位",
          followUpContract: {
            coverageMode: "all_required",
            facets: [
              {
                id: "facet-role",
                label: "岗位",
                sourceField: "evaluation_focus",
                sourceText: "岗位",
              },
            ],
            schemaVersion: 1,
          },
          followUpDirections: null,
          id: "question-with-directions",
          sortOrder: 0,
          templateId: "template-1",
          updatedAt: now,
        },
        {
          content: "请做自我介绍。",
          createdAt: now,
          difficulty: "easy",
          evaluationFocus: null,
          followUpContract: {
            coverageMode: "sufficient_for_evaluation",
            facets: [
              {
                id: "legacy-facet",
                label: "介绍",
                sourceField: "question",
                sourceText: "自我介绍",
              },
            ],
            schemaVersion: 1,
          },
          followUpDirections: null,
          id: "question-without-directions",
          sortOrder: 1,
          templateId: "template-1",
          updatedAt: now,
        },
      ],
      scope: "global",
      title: "通用沟通题",
      updatedAt: now,
    };
    const { root } = await renderInAct(
      <InterviewQuestionTemplateEditorDialog
        jobDescriptions={[]}
        onOpenChange={() => {}}
        onSaved={() => {}}
        open
        record={record}
        showDeveloperDetails
        slug="default"
      />,
    );
    roots.push(root);

    expect(document.querySelector('[aria-label="查看第 1 题追问契约"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="查看第 2 题追问契约"]')).toBeNull();
  });

  it("can open the create dialog without recursively resetting form state", async () => {
    const { root } = await renderInAct(
      <InterviewQuestionTemplateEditorDialog
        jobDescriptions={[]}
        onOpenChange={() => {}}
        onSaved={() => {}}
        open
        record={null}
        slug="default"
      />,
    );
    roots.push(root);

    expect(document.body.textContent).toContain("创建沟通题");
  });

  it("shows a visible validation message when all questions are removed", async () => {
    const { root } = await renderInAct(
      <InterviewQuestionTemplateEditorDialog
        jobDescriptions={[]}
        onOpenChange={() => {}}
        onSaved={() => {}}
        open
        record={null}
        slug="default"
      />,
    );
    roots.push(root);

    const deleteButton = document.querySelector<HTMLButtonElement>('[aria-label="删除第 1 题"]');
    expect(deleteButton).toBeTruthy();
    await act(async () => {
      deleteButton?.click();
      await Promise.resolve();
    });

    const submitButton = document.querySelector<HTMLButtonElement>(
      'button[form="interview-question-template-form"]',
    );
    expect(submitButton).toBeTruthy();
    await act(async () => {
      submitButton?.click();
      await Promise.resolve();
    });

    await waitForUi(() => {
      expect(document.body.textContent).toContain("请至少保留一道题目");
    });
  });
});
