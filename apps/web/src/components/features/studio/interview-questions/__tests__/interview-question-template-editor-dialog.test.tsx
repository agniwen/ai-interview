// @vitest-environment jsdom

import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  vi.unstubAllGlobals();
});

const toggle = () =>
  document.querySelector<HTMLButtonElement>('button[aria-label$="第 1 题"][aria-expanded]');

describe("InterviewQuestionTemplateEditorDialog", () => {
  it.each(["dialog", "page"] as const)(
    "loads historical questions without exposing legacy contracts in %s presentation",
    async (presentation) => {
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
          presentation={presentation}
          jobDescriptions={[]}
          onOpenChange={() => {}}
          onSaved={() => {}}
          open
          record={record}
          slug="default"
        />,
      );
      roots.push(root);

      expect(document.querySelector('[aria-label="查看第 1 题追问契约"]')).toBeNull();
      expect([...document.querySelectorAll("textarea")].map((input) => input.value)).toContain(
        "请介绍最近一份工作。",
      );
      expect(document.querySelector('[aria-label="查看第 2 题追问契约"]')).toBeNull();
    },
  );

  it("keeps collapsed drafts, opens newly added questions, and reveals invalid fields", async () => {
    const { root } = await renderInAct(
      <InterviewQuestionTemplateEditorDialog
        presentation="page"
        open
        record={null}
        slug="default"
        jobDescriptions={[]}
        onOpenChange={() => {}}
        onSaved={() => {
          throw new Error("Invalid draft must not save");
        }}
        initialDraft={{
          description: "",
          jobDescriptionIds: [],
          questions: [
            {
              content: "第一道题",
              difficulty: "easy",
              evaluationFocus: "",
              followUpDirections: "",
              id: "q1",
              sortOrder: 0,
            },
            {
              content: "第二道题",
              difficulty: "easy",
              evaluationFocus: "",
              followUpDirections: "",
              id: "q2",
              sortOrder: 1,
            },
          ],
          scope: "global",
          title: "编辑交互",
        }}
      />,
    );
    roots.push(root);

    expect(toggle()?.getAttribute("aria-expanded")).toBe("false");
    act(() => toggle()?.click());
    const input = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="第 1 题题干"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    act(() => {
      setter?.call(input, "修改后的第一道题");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => toggle()?.click());
    expect(toggle()?.textContent).toContain("修改后的第一道题");
    expect(toggle()?.getAttribute("aria-expanded")).toBe("false");
    act(() => toggle()?.click());
    expect(input?.value).toBe("修改后的第一道题");
    act(() => {
      setter?.call(input, "");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => toggle()?.click());
    await act(async () => {
      document
        .querySelector<HTMLButtonElement>('button[form="interview-question-template-form"]')
        ?.click();
      await Promise.resolve();
    });
    await waitForUi(() => expect(toggle()?.getAttribute("aria-expanded")).toBe("true"));
    const add = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.includes("添加题目"),
    );
    act(() => add?.click());
    await waitForUi(() =>
      expect(
        document.querySelector('button[aria-label="收起第 3 题"]')?.getAttribute("aria-expanded"),
      ).toBe("true"),
    );
  });

  it("hands a newly created record to the edit-page transition without closing the page", async () => {
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    const onSaved = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ id: "created-template" }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const { root } = await renderInAct(
      <InterviewQuestionTemplateEditorDialog
        presentation="page"
        initialDraft={{
          description: "",
          jobDescriptionIds: [],
          questions: [{ content: "介绍一下最近的工作", difficulty: "easy", sortOrder: 0 }],
          scope: "global",
          title: "新模板",
        }}
        jobDescriptions={[]}
        onCreated={onCreated}
        onOpenChange={onOpenChange}
        onSaved={onSaved}
        open
        record={null}
        slug="default"
      />,
    );
    roots.push(root);
    await act(async () => {
      document
        .querySelector<HTMLButtonElement>('button[form="interview-question-template-form"]')
        ?.click();
      await Promise.resolve();
    });
    await waitForUi(() => expect(onCreated).toHaveBeenCalledWith("created-template"));
    expect(onSaved).toHaveBeenCalledOnce();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
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
    const questionTextareas = [
      document.querySelector('textarea[placeholder="请输入一道必问题目…"]'),
      document.querySelector("#questions-0-evaluationFocus"),
      document.querySelector("#questions-0-followUpDirections"),
    ];
    for (const textarea of questionTextareas) {
      expect(textarea).toBeInstanceOf(HTMLTextAreaElement);
      if (!(textarea instanceof HTMLTextAreaElement)) {
        throw new Error("expected question textarea");
      }
    }
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
