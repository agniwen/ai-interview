// @vitest-environment jsdom

import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
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

    expect(document.body.textContent).toContain("新建沟通题");
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
